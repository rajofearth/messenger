package expo.modules.devicescheme

import android.app.Application
import android.content.ComponentCallbacks
import android.content.res.Configuration
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Reports the scheme the device itself is in, and every change to it.
 *
 * React Native's `Appearance` asks the running activity for the scheme. An app
 * that sets a night mode - and "automatic" does, through expo-system-ui - hands
 * AppCompat a configuration to remember, which Android then re-applies on every
 * later configuration change. The activity therefore keeps the scheme the
 * device had when it was created, and neither it nor `Appearance` reports a
 * switch made while the app runs.
 *
 * The application context is never given that configuration, so its resources
 * hold the device's own scheme and Android updates them in place. That is what
 * this module watches. Like `Appearance`, it reports only "light" or "dark".
 */
class DeviceSchemeModule : Module() {
  private var callbacks: ComponentCallbacks? = null

  override fun definition() = ModuleDefinition {
    Name("DeviceScheme")
    Events("onDeviceSchemeChanged")

    Function("getDeviceScheme") { schemeOf(application()?.resources?.configuration) }

    OnCreate {
      val application = application() ?: return@OnCreate
      val listener = object : ComponentCallbacks {
        override fun onConfigurationChanged(newConfig: Configuration) {
          sendEvent("onDeviceSchemeChanged", mapOf("scheme" to schemeOf(newConfig)))
        }

        override fun onLowMemory() = Unit
      }
      callbacks = listener
      application.registerComponentCallbacks(listener)
    }

    OnDestroy {
      val listener = callbacks ?: return@OnDestroy
      callbacks = null
      application()?.unregisterComponentCallbacks(listener)
    }
  }

  private fun application(): Application? =
    appContext.reactContext?.applicationContext as? Application

  private fun schemeOf(configuration: Configuration?): String =
    when (configuration?.uiMode?.and(Configuration.UI_MODE_NIGHT_MASK)) {
      Configuration.UI_MODE_NIGHT_YES -> "dark"
      else -> "light"
    }
}
