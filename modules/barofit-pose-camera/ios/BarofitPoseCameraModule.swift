import ExpoModulesCore

public final class BarofitPoseCameraModule: Module {
  public func definition() -> ModuleDefinition {
    Name("BarofitPoseCamera")

    View(BarofitPoseCameraView.self) {
      Events("onPose", "onPoseError", "onCameraStatus")

      Prop("active") { (view: BarofitPoseCameraView, active: Bool?) in
        view.setActive(active ?? true)
      }

      Prop("frontCamera") { (view: BarofitPoseCameraView, frontCamera: Bool?) in
        view.setFrontCamera(frontCamera ?? true)
      }
    }
  }
}
