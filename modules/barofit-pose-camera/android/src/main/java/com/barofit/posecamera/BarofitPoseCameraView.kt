package com.barofit.posecamera

import android.Manifest
import android.annotation.SuppressLint
import android.content.Context
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.Color
import android.graphics.Matrix
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.util.Size
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.ImageProxy
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.core.content.ContextCompat
import androidx.lifecycle.LifecycleOwner
import com.google.mediapipe.framework.image.BitmapImageBuilder
import com.google.mediapipe.tasks.core.BaseOptions
import com.google.mediapipe.tasks.vision.core.RunningMode
import com.google.mediapipe.tasks.vision.poselandmarker.PoseLandmarker
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.viewevent.EventDispatcher
import expo.modules.kotlin.views.ExpoView
import java.util.concurrent.Executors

/**
 * 순수 MediaPipe 33개 관절 좌표(landmarks) 추출기 + 카메라 프리뷰 뷰.
 * UI 오버레이(스켈레톤·가이드·판정)는 전혀 포함하지 않으며, 추출된 좌표만 JS로 전달합니다.
 */
@SuppressLint("ViewConstructor")
class BarofitPoseCameraView(
  context: Context,
  appContext: AppContext
) : ExpoView(context, appContext) {
  companion object {
    private const val TAG = "BarofitPoseCameraView"
  }

  override val shouldUseAndroidLayout: Boolean = true

  private val onPose by EventDispatcher()
  private val onPoseError by EventDispatcher()
  private val onCameraStatus by EventDispatcher()

  private val container = NativeCameraLayout(context)
  private val previewView get() = container.previewView
  private val mainHandler = Handler(Looper.getMainLooper())
  private val exec = Executors.newSingleThreadExecutor()

  private var provider: ProcessCameraProvider? = null
  private var analysis: ImageAnalysis? = null
  private var detector: PoseLandmarker? = null

  private var isActiveProp = true
  private var useFront = true
  private var isBinding = false
  private var frameCounter = 0
  private var lastAnalyzeMs = 0L

  init {
    setBackgroundColor(Color.BLACK)
    addView(container, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT))
  }

  override fun onLayout(changed: Boolean, l: Int, t: Int, r: Int, b: Int) {
    val w = r - l
    val h = b - t
    container.measure(
      MeasureSpec.makeMeasureSpec(w, MeasureSpec.EXACTLY),
      MeasureSpec.makeMeasureSpec(h, MeasureSpec.EXACTLY)
    )
    container.layout(0, 0, w, h)
  }

  fun setActive(value: Boolean) {
    if (isActiveProp == value) return
    isActiveProp = value
    if (value && isAttachedToWindow) start() else if (!value) stop()
  }

  fun setFrontCamera(value: Boolean) {
    if (useFront == value) return
    useFront = value
    if (isActiveProp && isAttachedToWindow) {
      stop()
      start()
    }
  }

  override fun onAttachedToWindow() {
    super.onAttachedToWindow()
    if (isActiveProp) start()
  }

  override fun onDetachedFromWindow() {
    stop()
    detector?.close()
    detector = null
    super.onDetachedFromWindow()
  }

  private fun hasPerm(): Boolean =
    ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA) ==
      PackageManager.PERMISSION_GRANTED

  private fun ensureDetector(): Boolean {
    if (detector != null) return true
    val assets = try {
      context.assets.list("")?.toSet() ?: emptySet()
    } catch (_: Throwable) {
      emptySet()
    }
    if (!assets.contains("pose_landmarker_full.task")) {
      emitError(
        "MODEL_INIT_FAILED",
        "pose_landmarker_full.task missing in assets."
      )
      return false
    }
    return try {
      val base = BaseOptions.builder()
        .setModelAssetPath("pose_landmarker_full.task")
        .build()
      val opts = PoseLandmarker.PoseLandmarkerOptions.builder()
        .setBaseOptions(base)
        .setRunningMode(RunningMode.VIDEO)
        .setNumPoses(1)
        .setMinPoseDetectionConfidence(0.5f)
        .setMinPosePresenceConfidence(0.5f)
        .setMinTrackingConfidence(0.5f)
        .build()
      detector = PoseLandmarker.createFromOptions(context, opts)
      true
    } catch (t: Throwable) {
      Log.e(TAG, "Detector init failed", t)
      emitError("MODEL_INIT_FAILED", t.message ?: "init failed")
      false
    }
  }

  private fun start() {
    if (isBinding) return
    if (!hasPerm()) {
      emitStatus("permission_denied", "CAMERA permission is not granted")
      emitError("CAMERA_PERMISSION_DENIED", "CAMERA permission is required")
      return
    }
    if (!ensureDetector()) return

    val owner = (appContext.currentActivity as? LifecycleOwner)
    if (owner == null) {
      emitError("NO_LIFECYCLE", "Current activity is not a LifecycleOwner")
      return
    }

    isBinding = true
    emitStatus("starting", null)

    val future = ProcessCameraProvider.getInstance(context)
    future.addListener({
      try {
        val camProvider = future.get()
        provider = camProvider
        camProvider.unbindAll()

        if (!isAttachedToWindow || !isActiveProp) {
          isBinding = false
          return@addListener
        }

        val selector = if (useFront) {
          CameraSelector.DEFAULT_FRONT_CAMERA
        } else {
          CameraSelector.DEFAULT_BACK_CAMERA
        }

        val preview = Preview.Builder().build().also {
          it.setSurfaceProvider(previewView.surfaceProvider)
        }

        val imageAnalysis = ImageAnalysis.Builder()
          .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
          .setOutputImageFormat(ImageAnalysis.OUTPUT_IMAGE_FORMAT_RGBA_8888)
          .setTargetResolution(Size(480, 640))
          .build()
          .also { ia ->
            ia.setAnalyzer(exec) { proxy -> analyze(proxy) }
          }
        analysis = imageAnalysis

        camProvider.bindToLifecycle(owner, selector, preview, imageAnalysis)
        previewView.post {
          container.requestLayout()
          previewView.requestLayout()
        }
        isBinding = false
        emitStatus("ready", null)
      } catch (t: Throwable) {
        Log.e(TAG, "bind failed", t)
        isBinding = false
        emitError("CAMERA_START_FAILED", t.message ?: "bind failed")
        emitStatus("error", t.message)
      }
    }, ContextCompat.getMainExecutor(context))
  }

  private fun stop() {
    isBinding = false
    try {
      analysis?.clearAnalyzer()
      analysis = null
      provider?.unbindAll()
      emitStatus("stopped", null)
    } catch (t: Throwable) {
      Log.w(TAG, "stop error", t)
    }
  }

  private fun analyze(proxy: ImageProxy) {
    val det = detector
    if (det == null || !isActiveProp) {
      proxy.close()
      return
    }
    val now = System.currentTimeMillis()
    if (now - lastAnalyzeMs < 67) {
      proxy.close()
      return
    }
    lastAnalyzeMs = now
    try {
      val bmp = toBitmap(proxy)
      val startMs = System.currentTimeMillis()
      val mpImg = BitmapImageBuilder(bmp).build()
      val res = det.detectForVideo(mpImg, now)
      val inferenceMs = System.currentTimeMillis() - startMs

      val lms = res.landmarks().firstOrNull()
      val points: List<List<Double>> = lms?.map { lm ->
        listOf(
          lm.x().toDouble(),
          lm.y().toDouble(),
          lm.z().toDouble(),
          lm.visibility().orElse(0f).toDouble(),
          lm.presence().orElse(0f).toDouble()
        )
      } ?: emptyList()

      frameCounter += 1
      val payload = mapOf<String, Any>(
        "timestampMs" to now.toDouble(),
        "width" to bmp.width,
        "height" to bmp.height,
        "landmarks" to points,
        "frameId" to frameCounter,
        "inferenceMs" to inferenceMs.toDouble()
      )
      mainHandler.post {
        onPose(payload)
      }
    } catch (t: Throwable) {
      Log.e(TAG, "analyze error", t)
      emitError("INFERENCE_FAILED", t.message ?: "analyze failed")
    } finally {
      proxy.close()
    }
  }

  private fun toBitmap(proxy: ImageProxy): Bitmap {
    val plane = proxy.planes[0]
    val buf = plane.buffer
    buf.rewind()
    val w = proxy.width
    val h = proxy.height
    val pixelStride = plane.pixelStride
    val rowStride = plane.rowStride
    val rowPadding = rowStride - pixelStride * w
    val strideW = w + rowPadding / pixelStride
    val raw = Bitmap.createBitmap(strideW, h, Bitmap.Config.ARGB_8888)
    raw.copyPixelsFromBuffer(buf)
    val cropped = if (strideW != w) Bitmap.createBitmap(raw, 0, 0, w, h) else raw

    val rot = proxy.imageInfo.rotationDegrees
    if (rot == 0) return cropped
    val m = Matrix()
    if (rot != 0) m.postRotate(rot.toFloat())
    return Bitmap.createBitmap(cropped, 0, 0, cropped.width, cropped.height, m, true)
  }

  private fun emitStatus(status: String, message: String?) {
    mainHandler.post {
      val payload = mutableMapOf<String, Any>("status" to status)
      if (message != null) {
        payload["message"] = message
      }
      onCameraStatus(payload)
    }
  }

  private fun emitError(code: String, message: String) {
    mainHandler.post {
      onPoseError(mapOf(
        "code" to code,
        "message" to message
      ))
    }
  }
}
