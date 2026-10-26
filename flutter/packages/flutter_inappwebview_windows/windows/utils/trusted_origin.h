// SPDX-License-Identifier: Apache-2.0
// See the package LICENSE.

#ifndef GOAL_HINT_TRUSTED_ORIGIN_H_
#define GOAL_HINT_TRUSTED_ORIGIN_H_

#include <windows.h>
#include <urlmon.h>
#include <wrl/client.h>

#include <string>

namespace flutter_inappwebview_plugin {

struct WebOrigin {
  std::wstring scheme;
  std::wstring host;
  DWORD port = 0;
};

inline bool ReadWebOrigin(const std::wstring& address, WebOrigin* origin) {
  if (address.empty() || address.find(L'\\') != std::wstring::npos) return false;
  for (const auto character : address) {
    if (character <= L' ' || character == 0x7f) return false;
  }
  Microsoft::WRL::ComPtr<IUri> uri;
  if (FAILED(CreateUri(address.c_str(),
      Uri_CREATE_CANONICALIZE | Uri_CREATE_NO_PRE_PROCESS_HTML_URI,
      0, uri.GetAddressOf()))) return false;

  BOOL has_user_info = FALSE;
  if (FAILED(uri->HasProperty(Uri_PROPERTY_USER_INFO, &has_user_info)) ||
      has_user_info) return false;

  BSTR scheme = nullptr;
  BSTR host = nullptr;
  BSTR authority = nullptr;
  DWORD port = 0;
  const auto scheme_result = uri->GetSchemeName(&scheme);
  const auto host_result = uri->GetHost(&host);
  const auto authority_result = uri->GetAuthority(&authority);
  const auto port_result = uri->GetPort(&port);
  const std::wstring parsed_scheme = scheme ? scheme : L"";
  const std::wstring parsed_host = host ? host : L"";
  const std::wstring parsed_authority = authority ? authority : L"";
  SysFreeString(scheme);
  SysFreeString(host);
  SysFreeString(authority);
  if (FAILED(scheme_result) || FAILED(host_result) || FAILED(authority_result) ||
      FAILED(port_result) || parsed_host.empty() || port == 0 || port > 65535 ||
      parsed_authority.find(L'@') != std::wstring::npos ||
      (parsed_scheme != L"http" && parsed_scheme != L"https")) return false;
  origin->scheme = parsed_scheme;
  origin->host = parsed_host;
  origin->port = port;
  return true;
}

// WebView2 and Windows parse the URL before comparing the full origin tuple.
// Hostname prefix/suffix checks cannot establish a trusted web origin.
inline bool IsTrustedNavigation(const std::wstring& address,
                                const std::wstring& trusted_origin) {
  WebOrigin requested;
  WebOrigin trusted;
  return ReadWebOrigin(address, &requested) &&
      ReadWebOrigin(trusted_origin, &trusted) &&
      requested.scheme == trusted.scheme && requested.host == trusted.host &&
      requested.port == trusted.port;
}

}  // namespace flutter_inappwebview_plugin

#endif  // GOAL_HINT_TRUSTED_ORIGIN_H_
