package com.example.restaurantroulette.controller;

import static org.junit.jupiter.api.Assertions.assertSame;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import com.example.restaurantroulette.service.AiReportProxyService;
import com.example.restaurantroulette.service.AuthenticatedUserService;
import com.example.restaurantroulette.service.PremiumService;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
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
}
