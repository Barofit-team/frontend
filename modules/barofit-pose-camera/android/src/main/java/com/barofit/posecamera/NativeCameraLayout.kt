package com.barofit.posecamera

import android.annotation.SuppressLint
import android.content.Context
import android.graphics.Color
import android.view.ViewGroup
import androidx.camera.view.PreviewView

@SuppressLint("ViewConstructor")
class NativeCameraLayout(context: Context) : ViewGroup(context) {
  val previewView = PreviewView(context).apply {
    implementationMode = PreviewView.ImplementationMode.COMPATIBLE
    scaleType = PreviewView.ScaleType.FILL_CENTER
  }

  init {
    setBackgroundColor(Color.BLACK)
    addView(previewView, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT))
  }

  override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
    val w = MeasureSpec.getSize(widthMeasureSpec)
    val h = MeasureSpec.getSize(heightMeasureSpec)
    setMeasuredDimension(w, h)
    val cw = MeasureSpec.makeMeasureSpec(w, MeasureSpec.EXACTLY)
    val ch = MeasureSpec.makeMeasureSpec(h, MeasureSpec.EXACTLY)
    for (i in 0 until childCount) {
      getChildAt(i).measure(cw, ch)
    }
  }

  override fun onLayout(changed: Boolean, l: Int, t: Int, r: Int, b: Int) {
    val w = r - l
    val h = b - t
    for (i in 0 until childCount) {
      getChildAt(i).layout(0, 0, w, h)
    }
  }

  override fun requestLayout() {
    super.requestLayout()
    post(measureAndLayout)
  }

  private val measureAndLayout = Runnable {
    if (!isAttachedToWindow) return@Runnable
    measure(
      MeasureSpec.makeMeasureSpec(width, MeasureSpec.EXACTLY),
      MeasureSpec.makeMeasureSpec(height, MeasureSpec.EXACTLY)
    )
    layout(left, top, right, bottom)
  }
}
