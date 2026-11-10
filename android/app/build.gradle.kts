import java.util.Properties

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

// 正式簽章：android/keystore.properties（不進版控）；沒有時 release 改用 debug 簽章，方便本機測試
val keystoreProps = Properties().apply {
    val f = rootProject.file("keystore.properties")
    if (f.exists()) f.inputStream().use { load(it) }
}

android {
    namespace = "com.luckyds.assistant"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.luckyds.assistant"
        minSdk = 26
        targetSdk = 35
        versionCode = 9
        versionName = "1.5.1"

        // 助手（會員 SPA）所在網域；娛樂城網址由 /api/public/app-config 下發，這裡只是預設值
        // 本機測試可用 ./gradlew assembleDebug -PassistantOrigin=http://localhost:5199 指向開發伺服器
        val assistantOrigin = (project.findProperty("assistantOrigin") as String?) ?: "https://luckyds.com"
        buildConfigField("String", "ASSISTANT_ORIGIN", "\"$assistantOrigin\"")
        buildConfigField("String", "DEFAULT_CASINO_URL", "\"https://www.ds8899.net/sty4_home.php?invite_code=su001&c=3\"")
    }

    signingConfigs {
        if (keystoreProps.isNotEmpty()) {
            create("release") {
                storeFile = rootProject.file(keystoreProps.getProperty("storeFile"))
                storePassword = keystoreProps.getProperty("storePassword")
                keyAlias = keystoreProps.getProperty("keyAlias")
                keyPassword = keystoreProps.getProperty("keyPassword")
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            signingConfig = signingConfigs.findByName("release") ?: signingConfigs.getByName("debug")
        }
        debug {
            // 不加 applicationIdSuffix：登入交接頁的 intent:// 指定了套件名稱
            versionNameSuffix = "-debug"
        }
    }

    buildFeatures {
        buildConfig = true
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }
}

dependencies {
    implementation("androidx.core:core-ktx:1.15.0")
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("androidx.activity:activity-ktx:1.9.3")
    implementation("androidx.browser:browser:1.8.0")
    implementation("androidx.webkit:webkit:1.12.1")
}
