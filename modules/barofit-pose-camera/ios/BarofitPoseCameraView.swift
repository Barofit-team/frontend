import AVFoundation
import ExpoModulesCore
import MediaPipeTasksVision
import UIKit

/**
 * 순수 MediaPipe 33개 관절 좌표(landmarks) 추출기 + 카메라 프리뷰 뷰.
 * UI 오버레이(스켈레톤·가이드·판정)는 전혀 포함하지 않으며, 추출된 좌표만 JS로 전달합니다.
 */
public final class BarofitPoseCameraView: ExpoView, AVCaptureVideoDataOutputSampleBufferDelegate {
  let onPose = EventDispatcher()
  let onPoseError = EventDispatcher()
  let onCameraStatus = EventDispatcher()

  private let session = AVCaptureSession()
  private let sessionQueue = DispatchQueue(label: "com.barofit.posecamera.sessionQueue")
  private let videoOutputQueue = DispatchQueue(label: "com.barofit.posecamera.videoOutputQueue")

  private let previewLayer = AVCaptureVideoPreviewLayer()

  private var detector: PoseLandmarker?
  private var isActiveProp: Bool = true
  private var useFrontCamera: Bool = true
  private var isSessionConfigured: Bool = false
  private var currentCameraPosition: AVCaptureDevice.Position = .front

  private var frameCounter: Int = 0
  private var lastAnalyzeMs: Int64 = 0

  public required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    clipsToBounds = true
    backgroundColor = .black

    session.automaticallyConfiguresApplicationAudioSession = false
    previewLayer.session = session
    previewLayer.videoGravity = .resizeAspectFill
    layer.addSublayer(previewLayer)

    NotificationCenter.default.addObserver(
      self,
      selector: #selector(handleAppDidBecomeActive),
      name: UIApplication.didBecomeActiveNotification,
      object: nil
    )
    NotificationCenter.default.addObserver(
      self,
      selector: #selector(handleAppWillResignActive),
      name: UIApplication.willResignActiveNotification,
      object: nil
    )
  }

  deinit {
    NotificationCenter.default.removeObserver(self)
    let captureSession = session
    let landmarker = detector
    detector = nil
    sessionQueue.async {
      if captureSession.isRunning {
        captureSession.stopRunning()
      }
      _ = landmarker
    }
  }

  public override func layoutSubviews() {
    super.layoutSubviews()
    CATransaction.begin()
    CATransaction.setDisableActions(true)
    previewLayer.frame = bounds
    CATransaction.commit()
  }

  public override func didMoveToWindow() {
    super.didMoveToWindow()
    if window != nil {
      if isActiveProp {
        startCamera()
      }
    } else {
      stopCamera()
    }
  }

  @objc private func handleAppDidBecomeActive() {
    if window != nil && isActiveProp {
      startCamera()
    }
  }

  @objc private func handleAppWillResignActive() {
    stopCamera()
  }

  func setActive(_ active: Bool) {
    guard isActiveProp != active else { return }
    isActiveProp = active
    if active && window != nil {
      startCamera()
    } else if !active {
      stopCamera()
    }
  }

  func setFrontCamera(_ front: Bool) {
    guard useFrontCamera != front else { return }
    useFrontCamera = front
    if isActiveProp && window != nil {
      reconfigureCameraInput()
    }
  }

  private func ensureDetector() -> Bool {
    if detector != nil {
      return true
    }

    let bundle = Bundle(for: BarofitPoseCameraView.self)
    guard let modelPath = bundle.path(forResource: "pose_landmarker_full", ofType: "task")
      ?? Bundle.main.path(forResource: "pose_landmarker_full", ofType: "task") else {
      emitError(
        code: "MODEL_INIT_FAILED",
        message: "pose_landmarker_full.task missing in bundle."
      )
      return false
    }

    do {
      let options = PoseLandmarkerOptions()
      options.baseOptions.modelAssetPath = modelPath
      options.baseOptions.delegate = .CPU
      options.runningMode = .video
      options.numPoses = 1
      options.minPoseDetectionConfidence = 0.5
      options.minPosePresenceConfidence = 0.5
      options.minTrackingConfidence = 0.5

      detector = try PoseLandmarker(options: options)
      return true
    } catch {
      emitError(
        code: "MODEL_INIT_FAILED",
        message: error.localizedDescription
      )
      return false
    }
  }

  private func startCamera() {
    let authStatus = AVCaptureDevice.authorizationStatus(for: .video)
    switch authStatus {
    case .authorized:
      startAuthorizedSession()
    case .notDetermined:
      AVCaptureDevice.requestAccess(for: .video) { [weak self] granted in
        guard let self else { return }
        if granted {
          self.startAuthorizedSession()
        } else {
          self.emitStatus(status: "permission_denied", message: "CAMERA permission is not granted")
          self.emitError(code: "CAMERA_PERMISSION_DENIED", message: "CAMERA permission is required")
        }
      }
    default:
      emitStatus(status: "permission_denied", message: "CAMERA permission is not granted")
      emitError(code: "CAMERA_PERMISSION_DENIED", message: "CAMERA permission is required")
    }
  }

  private func startAuthorizedSession() {
    emitStatus(status: "starting", message: nil)
    let desiredPosition: AVCaptureDevice.Position = useFrontCamera ? .front : .back

    sessionQueue.async { [weak self] in
      guard let self else { return }
      guard self.ensureDetector() else { return }

      if !self.isSessionConfigured || self.currentCameraPosition != desiredPosition {
        self.configureSession(position: desiredPosition)
      }

      if !self.session.isRunning && self.isActiveProp {
        self.session.startRunning()
      }
      if self.session.isRunning {
        self.emitStatus(status: "ready", message: nil)
      }
    }
  }

  private func reconfigureCameraInput() {
    let desiredPosition: AVCaptureDevice.Position = useFrontCamera ? .front : .back
    sessionQueue.async { [weak self] in
      guard let self else { return }
      self.configureSession(position: desiredPosition)
      if !self.session.isRunning && self.isActiveProp {
        self.session.startRunning()
      }
      self.emitStatus(status: "ready", message: nil)
    }
  }

  private func configureSession(position: AVCaptureDevice.Position) {
    session.beginConfiguration()
    defer { session.commitConfiguration() }

    session.automaticallyConfiguresApplicationAudioSession = false
    if session.canSetSessionPreset(.vga640x480) {
      session.sessionPreset = .vga640x480
    } else if session.canSetSessionPreset(.medium) {
      session.sessionPreset = .medium
    }

    for input in session.inputs {
      session.removeInput(input)
    }
    for output in session.outputs {
      session.removeOutput(output)
    }

    guard let device = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: position)
      ?? AVCaptureDevice.default(for: .video) else {
      emitError(code: "CAMERA_START_FAILED", message: "No video capture device available")
      emitStatus(status: "error", message: "No video capture device available")
      return
    }

    do {
      let input = try AVCaptureDeviceInput(device: device)
      if session.canAddInput(input) {
        session.addInput(input)
      }
    } catch {
      emitError(code: "CAMERA_START_FAILED", message: error.localizedDescription)
      emitStatus(status: "error", message: error.localizedDescription)
      return
    }

    let videoOutput = AVCaptureVideoDataOutput()
    videoOutput.alwaysDiscardsLateVideoFrames = true
    videoOutput.videoSettings = [
      kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA
    ]
    videoOutput.setSampleBufferDelegate(self, queue: videoOutputQueue)

    if session.canAddOutput(videoOutput) {
      session.addOutput(videoOutput)
    }

    if let connection = videoOutput.connection(with: .video) {
      if connection.isVideoOrientationSupported {
        connection.videoOrientation = .portrait
      }
      // Keep inference image unmirrored so MediaPipe anatomical LEFT/RIGHT landmarks stay accurate
      if connection.isVideoMirroringSupported {
        connection.automaticallyAdjustsVideoMirroring = false
        connection.isVideoMirrored = false
      }
    }

    DispatchQueue.main.async { [weak self] in
      guard let self else { return }
      if let previewConnection = self.previewLayer.connection {
        if previewConnection.isVideoOrientationSupported {
          previewConnection.videoOrientation = .portrait
        }
        if previewConnection.isVideoMirroringSupported {
          previewConnection.automaticallyAdjustsVideoMirroring = false
          previewConnection.isVideoMirrored = (position == .front)
        }
      }
    }

    currentCameraPosition = position
    isSessionConfigured = true
  }

  private func stopCamera() {
    sessionQueue.async { [weak self] in
      guard let self else { return }
      if self.session.isRunning {
        self.session.stopRunning()
        self.emitStatus(status: "stopped", message: nil)
      }
    }
  }

  public func captureOutput(
    _ output: AVCaptureOutput,
    didOutput sampleBuffer: CMSampleBuffer,
    from connection: AVCaptureConnection
  ) {
    guard isActiveProp, let landmarker = detector else { return }

    let nowMs = Int64(Date().timeIntervalSince1970 * 1000.0)
    // Throttle to ~15fps (67ms between frames) matching Android
    if nowMs - lastAnalyzeMs < 67 {
      return
    }
    lastAnalyzeMs = nowMs

    guard let pixelBuffer = CMSampleBufferGetImageBuffer(sampleBuffer) else { return }
    let rawWidth = CVPixelBufferGetWidth(pixelBuffer)
    let rawHeight = CVPixelBufferGetHeight(pixelBuffer)
    let isLandscapeBuffer = rawWidth > rawHeight
    let frameWidth = isLandscapeBuffer ? rawHeight : rawWidth
    let frameHeight = isLandscapeBuffer ? rawWidth : rawHeight
    let imageOrientation: UIImage.Orientation = isLandscapeBuffer
      ? (currentCameraPosition == .front ? .leftMirrored : .right)
      : .up

    do {
      let startMs = Int64(Date().timeIntervalSince1970 * 1000.0)
      let mpImage = try MPImage(sampleBuffer: sampleBuffer, orientation: imageOrientation)
      let result = try landmarker.detect(videoFrame: mpImage, timestampInMilliseconds: Int(nowMs))
      let inferenceMs = Int64(Date().timeIntervalSince1970 * 1000.0) - startMs

      let points: [[Double]] = result.landmarks.first?.map { lm in
        [
          Double(lm.x),
          Double(lm.y),
          Double(lm.z),
          Double(lm.visibility?.floatValue ?? 0),
          Double(lm.presence?.floatValue ?? 0)
        ]
      } ?? []

      frameCounter += 1
      let currentFrameId = frameCounter

      DispatchQueue.main.async { [weak self] in
        self?.onPose([
          "timestampMs": Double(nowMs),
          "width": frameWidth,
          "height": frameHeight,
          "landmarks": points,
          "frameId": currentFrameId,
          "inferenceMs": Double(inferenceMs)
        ])
      }
    } catch {
      emitError(code: "INFERENCE_FAILED", message: error.localizedDescription)
    }
  }

  private func emitStatus(status: String, message: String?) {
    DispatchQueue.main.async { [weak self] in
      var payload: [String: Any] = ["status": status]
      if let message {
        payload["message"] = message
      }
      self?.onCameraStatus(payload)
    }
  }

  private func emitError(code: String, message: String) {
    DispatchQueue.main.async { [weak self] in
      self?.onPoseError([
        "code": code,
        "message": message
      ])
    }
  }
}
