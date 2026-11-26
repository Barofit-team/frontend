# Keep MediaPipe tasks-vision and Protobuf Lite classes/fields from R8 obfuscation
# (MediaPipe uses Protobuf reflection to look up fields like `platform_`)
-keep class com.google.mediapipe.** { *; }
-dontwarn com.google.mediapipe.proto.**
-keep class com.google.protobuf.** { *; }
-keepclassmembers class * extends com.google.protobuf.GeneratedMessageLite { *; }
-keep class com.barofit.posecamera.** { *; }

# Flogger: MediaPipe's Graph.<clinit> logs via FluentLogger, which finds its caller by
# matching class names on the call stack. R8 renaming/outlining breaks this lookup and
# throws "no caller found on the stack", which permanently poisons Graph's static
# initializer (NoClassDefFoundError on every retry until the app is killed).
-keep class com.google.common.flogger.** { *; }
-dontwarn com.google.common.flogger.**
