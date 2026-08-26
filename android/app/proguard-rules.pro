# ProGuard/R8 rules for the release build.
#
# R8 removes what it cannot see referenced. Everything below is reached by
# reflection, by JNI, or from JavaScript at runtime -- none of which R8 can
# follow -- so without these rules the APK builds and installs cleanly and
# then fails at runtime, which is the worst possible failure shape.
#
# Most libraries here also ship consumer rules inside their AAR. These are
# deliberately kept anyway: consumer rules change between versions, and a
# silent notification failure is not something to leave to an upgrade.

# ── React Native core ────────────────────────────────────────────────────
# Native methods are resolved by JNI name; renaming them breaks the binding.
-keepclasseswithmembernames class * {
    native <methods>;
}

# The bridge finds native modules and their exported methods by annotation
# and reflection, never by a Java call site R8 can trace.
-keep,allowobfuscation @interface com.facebook.proguard.annotations.DoNotStrip
-keep,allowobfuscation @interface com.facebook.proguard.annotations.KeepGettersAndSetters
-keep,allowobfuscation @interface com.facebook.react.bridge.ReactMethod
-keep,allowobfuscation @interface com.facebook.react.uimanager.annotations.ReactProp

-keep @com.facebook.proguard.annotations.DoNotStrip class *
-keepclassmembers class * {
    @com.facebook.proguard.annotations.DoNotStrip *;
    @com.facebook.react.bridge.ReactMethod *;
    @com.facebook.react.uimanager.annotations.ReactProp *;
    @com.facebook.react.uimanager.annotations.ReactPropGroup *;
}

-keep class com.facebook.react.** { *; }
-keep class com.facebook.jni.** { *; }
-keep class com.facebook.hermes.** { *; }
-keep class com.facebook.soloader.** { *; }

# TurboModules / Fabric: newArchEnabled=true, so the codegen'd JNI glue is
# live and is reached only from C++.
-keep class * implements com.facebook.react.bridge.NativeModule { *; }
-keep class * implements com.facebook.react.bridge.JavaScriptModule { *; }
-keep class * extends com.facebook.react.bridge.ReactContextBaseJavaModule { *; }
-keep class * extends com.facebook.react.uimanager.ViewManager { *; }

# ── This app's own bridge surface ────────────────────────────────────────
-keep class com.kimsparking.** { *; }

# ── Notifications ────────────────────────────────────────────────────────
# notifee and FCM are the reason this file matters most. A stripped
# notification path produces an app that looks perfectly healthy and simply
# never alerts anyone -- exactly the failure 1.9.12 shipped, and one no
# smoke test catches unless it explicitly waits for a notification.
-keep class io.invertase.notifee.** { *; }
-keep class app.notifee.** { *; }
-keep class io.invertase.firebase.** { *; }
-keep class com.google.firebase.** { *; }
-keep class com.google.android.gms.** { *; }
-dontwarn com.google.firebase.**
-dontwarn com.google.android.gms.**

# FCM instantiates services by manifest name.
-keep class * extends com.google.firebase.messaging.FirebaseMessagingService { *; }

# ── WebView ──────────────────────────────────────────────────────────────
# The Leaflet maps and the vehicle-setup screen call into the page through
# injected JS; @JavascriptInterface members are invoked by name.
-keep class com.reactnativecommunity.webview.** { *; }
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

# ── Other native modules ─────────────────────────────────────────────────
-keep class com.reactnativecommunity.asyncstorage.** { *; }
-keep class com.RNFetchBlob.** { *; }
-keep class com.ReactNativeBlobUtil.** { *; }
-keep class com.agontuk.RNFusedLocation.** { *; }
-keep class com.swmansion.** { *; }
-keep class com.th3rdwave.safeareacontext.** { *; }
-keep class com.horcrux.svg.** { *; }
-keep class com.oblador.vectoricons.** { *; }
-keep class com.BV.LinearGradient.** { *; }

# ── HTTP stack ───────────────────────────────────────────────────────────
# OkHttp/Okio reference optional platform classes that are absent at
# runtime; without these R8 fails the build on warnings rather than at run.
-dontwarn okhttp3.**
-dontwarn okio.**
-dontwarn javax.annotation.**
-dontwarn org.conscrypt.**
-dontwarn org.bouncycastle.**
-dontwarn org.openjsse.**
-keep class okhttp3.** { *; }
-keep class okio.** { *; }

# ── Kotlin ───────────────────────────────────────────────────────────────
-keep class kotlin.Metadata { *; }
-dontwarn kotlin.**

# ── Diagnostics ──────────────────────────────────────────────────────────
# Line numbers survive so a production stack trace stays readable; the
# source file name is renamed rather than kept, which is the usual pairing.
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile

# Annotations drive the bridge wiring above, so they have to survive.
-keepattributes *Annotation*,Signature,InnerClasses,EnclosingMethod
