package com.example.restaurantroulette.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.example.restaurantroulette.dto.ApiDtos.EmailVerificationResponse;
import com.example.restaurantroulette.exception.BadRequestException;
import java.time.Instant;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.Test;

class AuthServiceMagicLinkTest {

  @Test
  void duplicateMagicLinkRequestsSendOnlyOneEmail() {
    SupabaseAuthService supabaseAuthService = mock(SupabaseAuthService.class);
    Instant expiresAt = Instant.parse("2026-07-28T04:00:00Z");
    when(supabaseAuthService.requestMagicLink(
        "user@example.com", "https://randish.jp/auth/callback", false))
        .thenReturn(expiresAt);
    AuthService authService = authService(supabaseAuthService);

    EmailVerificationResponse first = authService.requestMagicLink(
        " User@Example.com ", "https://randish.jp/auth/callback", false);
    EmailVerificationResponse second = authService.requestMagicLink(
        "user@example.com", "https://randish.jp/auth/callback", false);

    assertThat(second).isEqualTo(first);
    verify(supabaseAuthService, times(1)).requestMagicLink(
        "user@example.com", "https://randish.jp/auth/callback", false);
  }

  @Test
  void concurrentMagicLinkRequestsSendOnlyOneEmail() throws Exception {
    SupabaseAuthService supabaseAuthService = mock(SupabaseAuthService.class);
    Instant expiresAt = Instant.parse("2026-07-28T04:00:00Z");
    when(supabaseAuthService.requestMagicLink(
        "user@example.com", "https://randish.jp/auth/callback", false))
        .thenReturn(expiresAt);
    AuthService authService = authService(supabaseAuthService);
    ExecutorService executor = Executors.newFixedThreadPool(2);
    CountDownLatch ready = new CountDownLatch(2);
    CountDownLatch start = new CountDownLatch(1);

    try {
      Future<EmailVerificationResponse> first = executor.submit(() -> {
        ready.countDown();
        start.await();
        return authService.requestMagicLink(
            "user@example.com", "https://randish.jp/auth/callback", false);
      });
      Future<EmailVerificationResponse> second = executor.submit(() -> {
        ready.countDown();
        start.await();
        return authService.requestMagicLink(
            "user@example.com", "https://randish.jp/auth/callback", false);
      });

      assertThat(ready.await(2, TimeUnit.SECONDS)).isTrue();
      start.countDown();
      assertThat(second.get(2, TimeUnit.SECONDS)).isEqualTo(first.get(2, TimeUnit.SECONDS));
    } finally {
      start.countDown();
      executor.shutdownNow();
    }
    verify(supabaseAuthService, times(1)).requestMagicLink(
        "user@example.com", "https://randish.jp/auth/callback", false);
  }

  @Test
  void failedMagicLinkRequestIsNotCached() {
    SupabaseAuthService supabaseAuthService = mock(SupabaseAuthService.class);
    Instant expiresAt = Instant.parse("2026-07-28T04:00:00Z");
    when(supabaseAuthService.requestMagicLink(
        "user@example.com", "https://randish.jp/auth/callback", true))
        .thenThrow(new BadRequestException("temporary failure"))
        .thenReturn(expiresAt);
    AuthService authService = authService(supabaseAuthService);

    assertThatThrownBy(() -> authService.requestMagicLink(
        "user@example.com", "https://randish.jp/auth/callback", true))
        .isInstanceOf(BadRequestException.class);
    assertThat(authService.requestMagicLink(
        "user@example.com", "https://randish.jp/auth/callback", true).expiresAt())
        .isEqualTo(expiresAt);
    verify(supabaseAuthService, times(2)).requestMagicLink(
        "user@example.com", "https://randish.jp/auth/callback", true);
  }

  private AuthService authService(SupabaseAuthService supabaseAuthService) {
    return new AuthService(
        mock(UserService.class),
        supabaseAuthService,
        mock(LocalSessionService.class));
  }
}
