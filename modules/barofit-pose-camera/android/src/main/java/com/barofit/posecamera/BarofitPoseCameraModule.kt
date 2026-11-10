package com.barofit.posecamera

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class BarofitPoseCameraModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("BarofitPoseCamera")

    View(BarofitPoseCameraView::class) {
      Events("onPose", "onPoseError", "onCameraStatus")

      Prop("active") { view: BarofitPoseCameraView, active: Boolean? ->
        view.setActive(active ?: true)
      }

      Prop("frontCamera") { view: BarofitPoseCameraView, frontCamera: Boolean? ->
        view.setFrontCamera(frontCamera ?: true)
      }
    }
  }
}
