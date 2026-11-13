#include "../utils/flutter.h"
#include "../utils/log.h"
#include "../utils/strconv.h"
#include "../utils/string.h"
#include "webview_environment.h"
#include "webview_environment_channel_delegate.h"

#include "webview_environment_manager.h"

namespace flutter_inappwebview_plugin
{
  WebViewEnvironmentChannelDelegate::WebViewEnvironmentChannelDelegate(WebViewEnvironment* webViewEnv, flutter::BinaryMessenger* messenger)
    : webViewEnvironment(webViewEnv), ChannelDelegate(messenger, WebViewEnvironment::METHOD_CHANNEL_NAME_PREFIX + webViewEnv->id)
  {}

  void WebViewEnvironmentChannelDelegate::HandleMethodCall(const flutter::MethodCall<flutter::EncodableValue>& method_call,
    std::unique_ptr<flutter::MethodResult<flutter::EncodableValue>> result)
  {
    if (!webViewEnvironment) {
      result->Success();
      return;
    }

    // auto& arguments = std::get<flutter::EncodableMap>(*method_call.arguments());
    auto& methodName = method_call.method_name();

    if (string_equals(methodName, "dispose")) {
      if (webViewEnvironment->plugin && webViewEnvironment->plugin->webViewEnvironmentManager) {
        std::map<std::string, std::unique_ptr<WebViewEnvironment>>& webViewEnvironments = webViewEnvironment->plugin->webViewEnvironmentManager->webViewEnvironments;
        auto& id = webViewEnvironment->id;
        if (map_contains(webViewEnvironments, id)) {
          webViewEnvironments.erase(id);
        }
      }
      result->Success();
    }
    else if (string_equals(methodName, "getUserAgent")) {
      auto webView = webViewEnvironment->getWebView();
      wil::com_ptr<ICoreWebView2Settings> settings;
      wil::com_ptr<ICoreWebView2Settings2> settings2;
      wil::unique_cotaskmem_string userAgent;
      if (webView && SUCCEEDED(webView->get_Settings(&settings)) && settings &&
        SUCCEEDED(settings->QueryInterface(IID_PPV_ARGS(&settings2))) &&
        SUCCEEDED(settings2->get_UserAgent(&userAgent)) && userAgent.get()) {
        result->Success(flutter::EncodableValue(wide_to_utf8(userAgent.get())));
      }
      else {
        result->Success();
      }
    }
    else {
      result->NotImplemented();
    }
  }

  WebViewEnvironmentChannelDelegate::~WebViewEnvironmentChannelDelegate()
  {
    debugLog("dealloc WebViewEnvironmentChannelDelegate");
    webViewEnvironment = nullptr;
  }
}
