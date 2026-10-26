import Cocoa
import FlutterMacOS

class MainFlutterWindow: NSWindow {
  private var appearanceChannel: FlutterMethodChannel?
  private var systemAppearanceObservation: NSKeyValueObservation?

  override func awakeFromNib() {
    let flutterViewController = FlutterViewController()
    let windowFrame = self.frame
    self.contentViewController = flutterViewController
    self.setFrame(windowFrame, display: true)

    // Keep WebKit's system fallback independent of the caption's web theme.
    // NSApp remains system-owned; only this window's decoration is overridden.
    let flutterView = flutterViewController.view
    flutterView.appearance = NSApp.effectiveAppearance
    systemAppearanceObservation = NSApp.observe(\.effectiveAppearance, options: [.initial, .new]) {
      [weak flutterView] application, _ in
      flutterView?.appearance = application.effectiveAppearance
    }

    // The branded launch surface remains white even in the OS dark appearance.
    appearance = NSAppearance(named: .aqua)
    backgroundColor = .white
    titlebarAppearsTransparent = true
    appearanceChannel = FlutterMethodChannel(
      name: "com.goalhint.goal_hint/appearance",
      binaryMessenger: flutterViewController.engine.binaryMessenger
    )
    appearanceChannel?.setMethodCallHandler { [weak self] call, result in
      guard call.method == "setTitleBarTheme" else {
        result(FlutterMethodNotImplemented)
        return
      }
      guard let values = call.arguments as? [String: Any], values.count == 3,
        let dark = values["dark"] as? Bool,
        let background = values["background"] as? Int,
        let foreground = values["foreground"] as? Int,
        (0...0xFFFFFF).contains(background), (0...0xFFFFFF).contains(foreground)
      else {
        result(FlutterError(code: "invalid_appearance", message: "Expected a public title-bar style.", details: nil))
        return
      }
      self?.appearance = NSAppearance(named: dark ? .darkAqua : .aqua)
      self?.backgroundColor = NSColor(
        srgbRed: CGFloat((background >> 16) & 255) / 255,
        green: CGFloat((background >> 8) & 255) / 255,
        blue: CGFloat(background & 255) / 255, alpha: 1
      )
      // Cocoa owns native title text contrast for the selected appearance.
      result(nil)
    }

    RegisterGeneratedPlugins(registry: flutterViewController)

    super.awakeFromNib()
  }
}
