package com.example.restaurantroulette.controller;

import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import com.example.restaurantroulette.exception.UnauthorizedException;
import com.example.restaurantroulette.service.AiReportProxyService;
import com.example.restaurantroulette.service.AuthenticatedUserService;
import com.example.restaurantroulette.service.PremiumService;
import com.example.restaurantroulette.service.external.GeoapifyRestaurantProvider;
import com.example.restaurantroulette.service.external.GooglePlacesEnrichmentService;
import com.example.restaurantroulette.service.external.HotPepperRestaurantProvider;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class PremiumControllerTest {
  @Mock
  private PremiumService premiumService;

  @Mock
  private AuthenticatedUserService authenticatedUserService;

  @Mock
  private AiReportProxyService aiReportProxyService;

  @Mock
  private HotPepperRestaurantProvider hotPepperRestaurantProvider;

  @Mock
  private GeoapifyRestaurantProvider geoapifyRestaurantProvider;

  @Mock
  private GooglePlacesEnrichmentService googlePlacesEnrichmentService;

  @InjectMocks
  private PremiumController controller;

  @Test
  void aiReportAllowsAnyAuthenticatedMatchingUserWhilePremiumUiIsHidden() {
    JsonNode payload = new ObjectMapper().createObjectNode().put("monthLabel", "7月");
    JsonNode generated = new ObjectMapper().createObjectNode().put("source", "gemini");
    when(aiReportProxyService.generate(payload)).thenReturn(generated);

    JsonNode response = controller.aiReport("Bearer valid-token", "user-123", payload);

    assertSame(generated, response);
    verify(authenticatedUserService).requireSameUser("Bearer valid-token", "user-123");
    verify(aiReportProxyService).generate(payload);
    verifyNoInteractions(premiumService);
  }

  @Test
  void devDiagnosticsRejectsUsersWithoutTheDevEntitlement() {
    when(premiumService.isDeveloper("user-123")).thenReturn(false);

    UnauthorizedException error = assertThrows(
        UnauthorizedException.class,
        () -> controller.devDiagnostics("Bearer valid-token", "user-123", null, null, false));

    assertTrue(error.getMessage().contains("Developer"));
    verify(authenticatedUserService).requireSameUser("Bearer valid-token", "user-123");
    // 権限が無い時点で外部プロバイダには一切触れない
    verifyNoInteractions(hotPepperRestaurantProvider, geoapifyRestaurantProvider, googlePlacesEnrichmentService);
  }

  @Test
  void devDiagnosticsDoesNotCallAnyExternalApiUnlessProbeIsRequested() {
    when(premiumService.isDeveloper("user-123")).thenReturn(true);
    when(geoapifyRestaurantProvider.diagnostics()).thenReturn(Map.of("provider", "GEOAPIFY"));
    when(googlePlacesEnrichmentService.diagnostics()).thenReturn(Map.of("provider", "GOOGLE_PLACES"));
    when(hotPepperRestaurantProvider.apiUsage()).thenReturn(Map.of("key", "hotpepper"));
    when(geoapifyRestaurantProvider.apiUsage()).thenReturn(Map.of("key", "geoapify"));
    when(googlePlacesEnrichmentService.apiUsage()).thenReturn(Map.of("key", "google_places"));

    Map<String, Object> result = controller.devDiagnostics("Bearer valid-token", "user-123", null, null, false);

    assertTrue(result.containsKey("providers"));
    assertTrue(result.containsKey("apiUsage"));
    // probe を指定していないので、実際にリクエストを飛ばす diagnostics(...) は呼ばれない
    assertTrue(!result.containsKey("probe"));
    verify(hotPepperRestaurantProvider, org.mockito.Mockito.never()).diagnostics(null, null);
  }
}
