package co.nowcleany.nowcleany_sellers

import android.content.ActivityNotFoundException
import android.content.Intent
import android.net.Uri
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel

class MainActivity : FlutterActivity() {
    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        // "How to get there": the phone's maps app with the route to a branch (no extra plugin).
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, "scip/maps").setMethodCallHandler { call, result ->
            if (call.method != "directions") {
                result.notImplemented()
                return@setMethodCallHandler
            }
            val latitude = call.argument<Double>("latitude")
            val longitude = call.argument<Double>("longitude")
            if (latitude == null || longitude == null) {
                result.error("args", "Faltan las coordenadas", null)
                return@setMethodCallHandler
            }
            val navigation = Intent(Intent.ACTION_VIEW, Uri.parse("google.navigation:q=$latitude,$longitude"))
            val anyMap = Intent(Intent.ACTION_VIEW, Uri.parse("geo:$latitude,$longitude?q=$latitude,$longitude"))
            val web = Intent(
                Intent.ACTION_VIEW,
                Uri.parse("https://www.google.com/maps/dir/?api=1&destination=$latitude,$longitude"),
            )
            for (intent in listOf(navigation, anyMap, web)) {
                try {
                    startActivity(intent)
                    result.success(true)
                    return@setMethodCallHandler
                } catch (_: ActivityNotFoundException) {
                    // Try the next way to open a map.
                }
            }
            result.success(false)
        }
    }
}
