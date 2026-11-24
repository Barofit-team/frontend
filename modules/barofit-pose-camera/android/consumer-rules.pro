# Keep MediaPipe tasks-vision and Protobuf Lite classes/fields from R8 obfuscation
# (MediaPipe uses Protobuf reflection to look up fields like `platform_`)
-keep class com.google.mediapipe.** { *; }
-dontwarn com.google.mediapipe.proto.**
-keep class com.google.protobuf.** { *; }
-keepclassmembers class * extends com.google.protobuf.GeneratedMessageLite { *; }
-keep class com.barofit.posecamera.** { *; }
