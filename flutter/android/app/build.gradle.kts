import java.util.Properties

plugins {
    id("com.android.application")
    // The Flutter Gradle Plugin must be applied after the Android and Kotlin Gradle plugins.
    id("dev.flutter.flutter-gradle-plugin")
}

// Keep credentials local or inject them through secured build environment values.
val releaseProperties = Properties()
rootProject.file("key.properties").takeIf { it.isFile }?.inputStream()?.use {
    releaseProperties.load(it)
}
fun signingValue(property: String, environment: String): String? =
    providers.environmentVariable(environment).orNull ?: releaseProperties.getProperty(property)

val releaseStorePath = signingValue("storeFile", "GOAL_HINT_ANDROID_STORE_FILE")
val releaseStorePassword = signingValue("storePassword", "GOAL_HINT_ANDROID_STORE_PASSWORD")
val releaseKeyAlias = signingValue("keyAlias", "GOAL_HINT_ANDROID_KEY_ALIAS")
val releaseKeyPassword = signingValue("keyPassword", "GOAL_HINT_ANDROID_KEY_PASSWORD")
val releaseStoreFile = releaseStorePath?.takeIf { it.isNotBlank() }?.let { rootProject.file(it) }
val verifyReleaseSigning = tasks.register("verifyReleaseSigning") {
    group = "verification"
    description = "Requires explicit signing credentials for Android release artifacts."
    doLast {
        if (listOf(releaseStorePath, releaseStorePassword, releaseKeyAlias, releaseKeyPassword)
                .any { it.isNullOrBlank() }) {
            throw GradleException(
                "Android release signing is not configured. Supply android/key.properties or " +
                    "the GOAL_HINT_ANDROID_* signing values; see flutter/docs/android-release.md. " +
                    "Release never falls back to debug signing.",
            )
        }
        if (releaseStoreFile?.isFile != true) {
            throw GradleException("The configured Android release keystore is not a regular file.")
        }
    }
}

android {
    namespace = "com.goalhint.goal_hint"
    compileSdk = flutter.compileSdkVersion
    ndkVersion = flutter.ndkVersion

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    defaultConfig {
        // Preserve this installed identity when shipping updates.
        applicationId = "com.goalhint.goal_hint"
        // You can update the following values to match your application needs.
        // For more information, see: https://flutter.dev/to/review-gradle-config.
        minSdk = flutter.minSdkVersion
        targetSdk = flutter.targetSdkVersion
        versionCode = flutter.versionCode
        versionName = flutter.versionName
    }

    signingConfigs {
        create("release") {
            storeFile = releaseStoreFile
            storePassword = releaseStorePassword
            keyAlias = releaseKeyAlias
            keyPassword = releaseKeyPassword
        }
    }

    buildTypes {
        release {
            signingConfig = signingConfigs.getByName("release")
        }
    }
}

// Apply the gate even when a parent task requests every variant. Debug builds
// remain available without credentials; APK and app-bundle release paths fail.
tasks.matching { it.name == "preReleaseBuild" || it.name == "validateSigningRelease" }.configureEach {
    dependsOn(verifyReleaseSigning)
}

kotlin {
    compilerOptions {
        jvmTarget = org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17
    }
}

flutter {
    source = "../.."
}
