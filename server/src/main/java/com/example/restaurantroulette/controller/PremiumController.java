package com.example.restaurantroulette.controller;

import com.example.restaurantroulette.dto.ApiDtos.PremiumStatusResponse;
import com.example.restaurantroulette.exception.UnauthorizedException;
import com.example.restaurantroulette.service.AiReportProxyService;
import com.example.restaurantroulette.service.AuthenticatedUserService;
import com.example.restaurantroulette.service.PremiumService;
import com.example.restaurantroulette.service.external.GeoapifyRestaurantProvider;
import com.example.restaurantroulette.service.external.GooglePlacesEnrichmentService;
import com.example.restaurantroulette.service.external.HotPepperRestaurantProvider;
import com.fasterxml.jackson.databind.JsonNode;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/premium")
public class PremiumController {
  private final PremiumService premiumService;
  private final AuthenticatedUserService authenticatedUserService;
  private final AiReportProxyService aiReportProxyService;
  private final HotPepperRestaurantProvider hotPepperRestaurantProvider;
  private final GeoapifyRestaurantProvider geoapifyRestaurantProvider;
  private final GooglePlacesEnrichmentService googlePlacesEnrichmentService;

  public PremiumController(
      PremiumService premiumService,
      AuthenticatedUserService authenticatedUserService,
      AiReportProxyService aiReportProxyService,
      HotPepperRestaurantProvider hotPepperRestaurantProvider,
      GeoapifyRestaurantProvider geoapifyRestaurantProvider,
      GooglePlacesEnrichmentService googlePlacesEnrichmentService) {
    this.premiumService = premiumService;
    this.authenticatedUserService = authenticatedUserService;
    this.aiReportProxyService = aiReportProxyService;
    this.hotPepperRestaurantProvider = hotPepperRestaurantProvider;
    this.geoapifyRestaurantProvider = geoapifyRestaurantProvider;
    this.googlePlacesEnrichmentService = googlePlacesEnrichmentService;
  }

  @GetMapping("/status")
  public PremiumStatusResponse status(
      @RequestHeader(value = "Authorization", required = false) String authorizationHeader,
      @RequestParam String userId) {
    authenticatedUserService.requireSameUserOrGuest(authorizationHeader, userId);
    return premiumService.status(userId);
  }

  @PostMapping("/ai-report")
  public JsonNode aiReport(
      @RequestHeader(value = "Authorization", required = false) String authorizationHeader,
      @RequestParam String userId,
      @RequestBody JsonNode payload) {
    authenticatedUserService.requireSameUser(authorizationHeader, userId);
    return aiReportProxyService.generate(payload);
  }

  /**
   * 開発者だけが見られる診断情報。
   * 管理パスワードではなく「ログイン中の本人が dev 権限を持っているか」で守るため、
   * 権限を剥奪すれば即座に見られなくなる。
   */
  @GetMapping("/dev-diagnostics")
  public Map<String, Object> devDiagnostics(
      @RequestHeader(value = "Authorization", required = false) String authorizationHeader,
      @RequestParam String userId,
      @RequestParam(required = false) String probeArea,
      @RequestParam(required = false) String probeGenre,
      @RequestParam(defaultValue = "false") boolean probe) {
    authenticatedUserService.requireSameUser(authorizationHeader, userId);
    if (!premiumService.isDeveloper(userId)) {
      throw new UnauthorizedException("Developer entitlement is required.");
    }
    Map<String, Object> result = new LinkedHashMap<>();
    result.put("generatedAt", Instant.now().toString());
    // 副作用のない設定・カウンタのスナップショットだけを返す（開くだけでは外部APIを叩かない）
    result.put("providers", List.of(
        geoapifyRestaurantProvider.diagnostics(),
        googlePlacesEnrichmentService.diagnostics()));
    result.put("apiUsage", List.of(
        hotPepperRestaurantProvider.apiUsage(),
        geoapifyRestaurantProvider.apiUsage(),
        googlePlacesEnrichmentService.apiUsage()));
    // probe=true のときだけ、実際にホットペッパーへ1回リクエストを飛ばして疎通を確かめる。
    // 「本当にリクエストが出ているか」を見たいとき用。無料APIなので費用は発生しない。
    if (probe) {
      result.put("probe", hotPepperRestaurantProvider.diagnostics(probeArea, probeGenre));
    }
    return result;
  }
}
