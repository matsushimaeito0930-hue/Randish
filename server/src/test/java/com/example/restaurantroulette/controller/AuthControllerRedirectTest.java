package com.example.restaurantroulette.controller;

import static org.assertj.core.api.Assertions.assertThat;

import com.example.restaurantroulette.service.AuthService;
import com.example.restaurantroulette.service.EmailRegistrationService;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;

class AuthControllerRedirectTest {
  private final AuthController controller = new AuthController(
      Mockito.mock(AuthService.class),
      Mockito.mock(EmailRegistrationService.class));

  @Test
  void allowsProductionWebCallbacks() {
    assertThat(controller.isAllowedOAuthAppRedirect("https://randish.jp/auth/callback")).isTrue();
    assertThat(controller.isAllowedOAuthAppRedirect("https://www.randish.jp/auth/callback")).isTrue();
  }

  @Test
  void keepsNativeAndLocalDevelopmentCallbacksAllowed() {
    assertThat(controller.isAllowedOAuthAppRedirect("randish://auth/callback")).isTrue();
    assertThat(controller.isAllowedOAuthAppRedirect("exp://10.0.0.12:8081/--/auth/callback")).isTrue();
    assertThat(controller.isAllowedOAuthAppRedirect("http://localhost:19006/auth/callback")).isTrue();
  }

  @Test
  void rejectsUntrustedWebCallbacks() {
    assertThat(controller.isAllowedOAuthAppRedirect("http://randish.jp/auth/callback")).isFalse();
    assertThat(controller.isAllowedOAuthAppRedirect("https://randish.jp.evil.example/auth/callback")).isFalse();
    assertThat(controller.isAllowedOAuthAppRedirect("https://randish.jp:8443/auth/callback")).isFalse();
    assertThat(controller.isAllowedOAuthAppRedirect("https://randish.jp/other/auth/callback")).isFalse();
  }
}
