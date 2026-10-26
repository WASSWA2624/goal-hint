// SPDX-License-Identifier: Apache-2.0
// See the package LICENSE.

#include "../utils/trusted_origin.h"

#include <iostream>
#include <vector>

int main() {
  using flutter_inappwebview_plugin::IsTrustedNavigation;
  struct Case { const wchar_t* address; const wchar_t* origin; bool expected; };
  const std::vector<Case> cases = {
    {L"https://goalhint.com/en?next=/account#plans", L"https://goalhint.com", true},
    {L"HTTPS://GOALHINT.COM:443/en", L"https://goalhint.com", true},
    {L"http://localhost:3000/en", L"http://localhost:3000", true},
    {L"http://[::1]:3000/en", L"http://[::1]:3000", true},
    {L"https://goalhint.com.evil.test/en", L"https://goalhint.com", false},
    {L"https://evilgoalhint.com/en", L"https://goalhint.com", false},
    {L"https://goalhint.com:444/en", L"https://goalhint.com", false},
    {L"http://goalhint.com/en", L"https://goalhint.com", false},
    {L"https://user@goalhint.com/en", L"https://goalhint.com", false},
    {L"https://@goalhint.com/en", L"https://goalhint.com", false},
    {L"https://goalhint.com@evil.test/en", L"https://goalhint.com", false},
    {L"https://goalhint.com\\@evil.test/en", L"https://goalhint.com", false},
    {L"https://goalhint.com:0/en", L"https://goalhint.com", false},
    {L"https://goalhint.com:65536/en", L"https://goalhint.com", false},
    {L"javascript:alert(1)", L"https://goalhint.com", false},
    {L"data:text/html,hello", L"https://goalhint.com", false},
    {L"file:///C:/Windows/win.ini", L"https://goalhint.com", false},
    {L"about:blank", L"https://goalhint.com", false},
    {L"https://goalhint.com/en", L"", false},
    {L" https://goalhint.com/en", L"https://goalhint.com", false},
  };
  for (const auto& entry : cases) {
    if (IsTrustedNavigation(entry.address, entry.origin) != entry.expected) {
      std::wcerr << L"Unexpected native navigation decision: " << entry.address << L'\n';
      return 1;
    }
  }
  std::cout << cases.size() << " native origin cases passed.\n";
  return 0;
}
