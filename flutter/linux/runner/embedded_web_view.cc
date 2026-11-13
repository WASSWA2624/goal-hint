#include "embedded_web_view.h"

#include <webkit2/webkit2.h>

namespace {

struct EmbeddedWebView {
  GtkStack* surfaces;
  FlMethodChannel* channel;
  WebKitWebView* browser;
  const char* failure;
  bool loading;
  bool has_document;
  bool committed;
  char* retry_uri;
};

void publish_state(EmbeddedWebView* shell) {
  g_autoptr(FlValue) state = fl_value_new_map();
  fl_value_set_string_take(state, "loading", fl_value_new_bool(shell->loading));
  fl_value_set_string_take(state, "hasDocument",
                           fl_value_new_bool(shell->has_document));
  fl_value_set_string_take(
      state, "canGoBack",
      fl_value_new_bool(webkit_web_view_can_go_back(shell->browser)));
  fl_value_set_string_take(state, "failure",
                           shell->failure ? fl_value_new_string(shell->failure)
                                          : fl_value_new_null());
  fl_method_channel_invoke_method(shell->channel, "state", state, nullptr,
                                  nullptr, nullptr);
  const char* surface =
      shell->has_document && !shell->failure ? "web" : "flutter";
  if (g_strcmp0(gtk_stack_get_visible_child_name(shell->surfaces), surface) !=
      0) {
    gtk_stack_set_visible_child_name(shell->surfaces, surface);
    gtk_widget_grab_focus(gtk_stack_get_visible_child(shell->surfaces));
  }
}

void load_changed(WebKitWebView*, WebKitLoadEvent event,
                  EmbeddedWebView* shell) {
  if (event == WEBKIT_LOAD_STARTED) {
    g_clear_pointer(&shell->retry_uri, g_free);
    shell->failure = nullptr;
    shell->loading = true;
    shell->committed = false;
  } else if (event == WEBKIT_LOAD_COMMITTED) {
    shell->committed = true;
  } else if (event == WEBKIT_LOAD_FINISHED) {
    shell->loading = false;
    if (shell->committed && !shell->failure) shell->has_document = true;
  }
  publish_state(shell);
}

gboolean load_failed(WebKitWebView*, WebKitLoadEvent, const char* uri,
                     GError* error, EmbeddedWebView* shell) {
  if (g_error_matches(error, WEBKIT_NETWORK_ERROR,
                      WEBKIT_NETWORK_ERROR_CANCELLED) ||
      g_error_matches(
          error, WEBKIT_POLICY_ERROR,
          WEBKIT_POLICY_ERROR_FRAME_LOAD_INTERRUPTED_BY_POLICY_CHANGE)) {
    return TRUE;
  }
  shell->failure = "connection";
  g_free(shell->retry_uri);
  shell->retry_uri = g_strdup(uri);
  shell->loading = false;
  publish_state(shell);
  return TRUE;
}

gboolean tls_failed(WebKitWebView*, const char* uri, GTlsCertificate*,
                    GTlsCertificateFlags, EmbeddedWebView* shell) {
  shell->failure = "secureConnection";
  g_free(shell->retry_uri);
  shell->retry_uri = g_strdup(uri);
  shell->loading = false;
  publish_state(shell);
  return TRUE;
}

void process_terminated(WebKitWebView*, WebKitWebProcessTerminationReason,
                        EmbeddedWebView* shell) {
  shell->failure = "browser";
  shell->has_document = false;
  shell->loading = false;
  publish_state(shell);
}

struct PendingNavigation {
  WebKitPolicyDecision* decision;
  GWeakRef browser;
  char* uri;
  bool new_window;
};

void navigation_decided(GObject* channel, GAsyncResult* result,
                        gpointer user_data) {
  auto* pending = static_cast<PendingNavigation*>(user_data);
  g_autoptr(FlMethodResponse) response = fl_method_channel_invoke_method_finish(
      FL_METHOD_CHANNEL(channel), result, nullptr);
  FlValue* allowed = FL_IS_METHOD_SUCCESS_RESPONSE(response)
                         ? fl_method_success_response_get_result(
                               FL_METHOD_SUCCESS_RESPONSE(response))
                         : nullptr;
  if (allowed && fl_value_get_type(allowed) == FL_VALUE_TYPE_BOOL &&
      fl_value_get_bool(allowed)) {
    if (pending->new_window) {
      g_autoptr(GObject) browser =
          static_cast<GObject*>(g_weak_ref_get(&pending->browser));
      webkit_policy_decision_ignore(pending->decision);
      if (browser)
        webkit_web_view_load_uri(WEBKIT_WEB_VIEW(browser), pending->uri);
    } else {
      webkit_policy_decision_use(pending->decision);
    }
  } else {
    webkit_policy_decision_ignore(pending->decision);
  }
  g_object_unref(pending->decision);
  g_weak_ref_clear(&pending->browser);
  g_free(pending->uri);
  g_free(pending);
}

gboolean decide_policy(WebKitWebView* browser, WebKitPolicyDecision* decision,
                       WebKitPolicyDecisionType type, EmbeddedWebView* shell) {
  if (type == WEBKIT_POLICY_DECISION_TYPE_RESPONSE) return FALSE;
  auto* action = webkit_navigation_policy_decision_get_navigation_action(
      WEBKIT_NAVIGATION_POLICY_DECISION(decision));
  const char* uri =
      webkit_uri_request_get_uri(webkit_navigation_action_get_request(action));
  if (!uri) {
    webkit_policy_decision_ignore(decision);
    return TRUE;
  }
  auto* pending = g_new0(PendingNavigation, 1);
  pending->decision = WEBKIT_POLICY_DECISION(g_object_ref(decision));
  pending->uri = g_strdup(uri);
  pending->new_window = type == WEBKIT_POLICY_DECISION_TYPE_NEW_WINDOW_ACTION;
  g_weak_ref_init(&pending->browser, G_OBJECT(browser));
  g_autoptr(FlValue) navigation = fl_value_new_map();
  fl_value_set_string_take(navigation, "address", fl_value_new_string(uri));
  fl_value_set_string_take(
      navigation, "userGesture",
      fl_value_new_bool(webkit_navigation_action_is_user_gesture(action)));
  fl_method_channel_invoke_method(shell->channel, "navigation", navigation,
                                  nullptr, navigation_decided, pending);
  return TRUE;
}

gboolean browser_shortcut(WebKitWebView* browser, GdkEventKey* event,
                          EmbeddedWebView*) {
  if (event->keyval == GDK_KEY_F5) {
    webkit_web_view_reload(browser);
    return TRUE;
  }
  if (event->keyval == GDK_KEY_Left && (event->state & GDK_MOD1_MASK) &&
      webkit_web_view_can_go_back(browser)) {
    webkit_web_view_go_back(browser);
    return TRUE;
  }
  return FALSE;
}

bool create_browser(EmbeddedWebView* shell, const char* app_agent) {
  const char* channel =
      g_str_has_suffix(app_agent, "/production") ? "production" : "development";
  g_autofree char* data =
      g_build_filename(g_get_user_data_dir(), APPLICATION_ID, channel, nullptr);
  g_autofree char* cache = g_build_filename(g_get_user_cache_dir(),
                                            APPLICATION_ID, channel, nullptr);
  if (g_mkdir_with_parents(data, 0700) != 0 ||
      g_mkdir_with_parents(cache, 0700) != 0)
    return false;

  g_autoptr(WebKitWebsiteDataManager) store = webkit_website_data_manager_new(
      "base-data-directory", data, "base-cache-directory", cache, nullptr);
  g_autoptr(WebKitWebContext) context =
      webkit_web_context_new_with_website_data_manager(store);
  g_autofree char* cookies = g_build_filename(data, "cookies.sqlite", nullptr);
  webkit_cookie_manager_set_persistent_storage(
      webkit_web_context_get_cookie_manager(context), cookies,
      WEBKIT_COOKIE_PERSISTENT_STORAGE_SQLITE);
  shell->browser = WEBKIT_WEB_VIEW(webkit_web_view_new_with_context(context));
  auto* settings = webkit_web_view_get_settings(shell->browser);
  webkit_settings_set_javascript_can_open_windows_automatically(settings,
                                                                FALSE);
  g_autofree char* agent = g_strdup_printf(
      "%s %s", webkit_settings_get_user_agent(settings), app_agent);
  webkit_settings_set_user_agent(settings, agent);
  g_signal_connect(shell->browser, "load-changed", G_CALLBACK(load_changed),
                   shell);
  g_signal_connect(shell->browser, "load-failed", G_CALLBACK(load_failed),
                   shell);
  g_signal_connect(shell->browser, "load-failed-with-tls-errors",
                   G_CALLBACK(tls_failed), shell);
  g_signal_connect(shell->browser, "web-process-terminated",
                   G_CALLBACK(process_terminated), shell);
  g_signal_connect(shell->browser, "decide-policy", G_CALLBACK(decide_policy),
                   shell);
  g_signal_connect(shell->browser, "key-press-event",
                   G_CALLBACK(browser_shortcut), shell);
  gtk_stack_add_named(shell->surfaces, GTK_WIDGET(shell->browser), "web");
  gtk_widget_show(GTK_WIDGET(shell->browser));
  return true;
}

void handle_method(FlMethodChannel*, FlMethodCall* call, gpointer user_data) {
  auto* shell = static_cast<EmbeddedWebView*>(user_data);
  const char* method = fl_method_call_get_name(call);
  FlValue* args = fl_method_call_get_args(call);
  const char* value = args && fl_value_get_type(args) == FL_VALUE_TYPE_STRING
                          ? fl_value_get_string(args)
                          : nullptr;
  if (g_str_equal(method, "initialize")) {
    if (!value || (!shell->browser && !create_browser(shell, value))) {
      fl_method_call_respond_error(
          call, "browser", "Could not initialize WebKitGTK.", nullptr, nullptr);
      return;
    }
  } else if (!shell->browser) {
    fl_method_call_respond_error(
        call, "browser", "WebKitGTK is not initialized.", nullptr, nullptr);
    return;
  } else if (g_str_equal(method, "load") && value) {
    webkit_web_view_load_uri(shell->browser, value);
  } else if (g_str_equal(method, "reload")) {
    if (shell->retry_uri) {
      g_autofree char* uri = g_steal_pointer(&shell->retry_uri);
      webkit_web_view_load_uri(shell->browser, uri);
    } else {
      webkit_web_view_reload(shell->browser);
    }
  } else if (g_str_equal(method, "goBack")) {
    if (webkit_web_view_can_go_back(shell->browser))
      webkit_web_view_go_back(shell->browser);
  } else {
    fl_method_call_respond_not_implemented(call, nullptr);
    return;
  }
  fl_method_call_respond_success(call, nullptr, nullptr);
}

void detach_browser(GtkWidget*, EmbeddedWebView* shell) {
  if (shell->browser)
    g_signal_handlers_disconnect_by_data(shell->browser, shell);
  fl_method_channel_set_method_call_handler(shell->channel, nullptr, nullptr,
                                            nullptr);
  g_clear_object(&shell->channel);
  g_clear_pointer(&shell->retry_uri, g_free);
}

}  // namespace

void install_embedded_web_view(GtkStack* surfaces, FlView* flutter_view) {
  auto* shell = g_new0(EmbeddedWebView, 1);
  shell->surfaces = surfaces;
  g_autoptr(FlStandardMethodCodec) codec = fl_standard_method_codec_new();
  auto* messenger =
      fl_engine_get_binary_messenger(fl_view_get_engine(flutter_view));
  shell->channel =
      fl_method_channel_new(messenger, "com.goalhint.goal_hint/linux_web_view",
                            FL_METHOD_CODEC(codec));
  fl_method_channel_set_method_call_handler(shell->channel, handle_method,
                                            shell, nullptr);
  g_object_set_data_full(G_OBJECT(surfaces), "embedded-web-view", shell,
                         g_free);
  g_signal_connect(surfaces, "destroy", G_CALLBACK(detach_browser), shell);
}
