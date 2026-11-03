import Flutter
import UIKit

@main
@objc class AppDelegate: FlutterAppDelegate, FlutterImplicitEngineDelegate {
  override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
  ) -> Bool {
    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
  }

  func didInitializeImplicitFlutterEngine(_ engineBridge: FlutterImplicitEngineBridge) {
    GeneratedPluginRegistrant.register(with: engineBridge.pluginRegistry)
    if let registrar = engineBridge.pluginRegistry.registrar(forPlugin: "GoalHintSlipDownload") {
      SlipDownloadPlugin.register(with: registrar)
    }
  }
}

/// Export generated PNGs with the system Files picker. Private filesystem paths never cross the bridge.
final class SlipDownloadPlugin: NSObject, FlutterPlugin, UIDocumentPickerDelegate {
  private var pending: FlutterResult?
  private var directory: URL?
  private weak var presenter: UIViewController?

  static func register(with registrar: FlutterPluginRegistrar) {
    let instance = SlipDownloadPlugin()
    instance.presenter = registrar.viewController()
    registrar.addMethodCallDelegate(instance, channel: FlutterMethodChannel(name: "com.goalhint.goal_hint/slip_download", binaryMessenger: registrar.messenger()))
  }

  func handle(_ call: FlutterMethodCall, result: @escaping FlutterResult) {
    guard call.method == "savePngs" else { result(FlutterMethodNotImplemented); return }
    guard pending == nil else { result(FlutterError(code: "busy", message: "A save is already open.", details: nil)); return }
    guard let entries = call.arguments as? [[String: Any]], !entries.isEmpty, entries.count <= 32 else {
      result(FlutterError(code: "invalid_images", message: "Invalid slip images.", details: nil)); return
    }
    do {
      let folder = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString, isDirectory: true)
      directory = folder
      try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
      var files = [URL](), total = 0
      for entry in entries {
        guard let name = entry["name"] as? String,
          name.range(of: "^goal-hint-(?:[0-9]{8}|[a-f0-9]{32})(?:-[0-9]{2,3})?\\.png$", options: .regularExpression) != nil,
          let bytes = entry["bytes"] as? FlutterStandardTypedData, (33...4194304).contains(bytes.data.count),
          bytes.data.prefix(8) == Data([137,80,78,71,13,10,26,10]) else { throw CocoaError(.fileWriteInvalidFileName) }
        total += bytes.data.count
        guard total <= 12582912 else { throw CocoaError(.fileWriteOutOfSpace) }
        let file = folder.appendingPathComponent(name)
        try bytes.data.write(to: file, options: .atomic)
        files.append(file)
      }
      guard let presenter = presenter, presenter.presentedViewController == nil else { throw CocoaError(.userCancelled) }
      let picker = UIDocumentPickerViewController(forExporting: files, asCopy: true)
      picker.delegate = self
      pending = result
      presenter.present(picker, animated: true)
    } catch {
      cleanup()
      result(FlutterError(code: "save_failed", message: "Could not save the slip images.", details: nil))
    }
  }

  func documentPickerWasCancelled(_ controller: UIDocumentPickerViewController) { finish(false) }
  func documentPicker(_ controller: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]) { finish(true) }
  private func finish(_ saved: Bool) { let result = pending; pending = nil; cleanup(); result?(saved) }
  private func cleanup() { if let folder = directory { try? FileManager.default.removeItem(at: folder) }; directory = nil }
}
