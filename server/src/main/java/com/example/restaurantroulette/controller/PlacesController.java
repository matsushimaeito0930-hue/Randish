package com.example.restaurantroulette.controller;

import com.example.restaurantroulette.dto.ApiDtos.NearbyPlacesRequest;
import com.example.restaurantroulette.dto.ApiDtos.NearbyPlacesResponse;
import com.example.restaurantroulette.service.AreaGeocodeService;
import com.example.restaurantroulette.service.AreaGeocodeService.AreaCenter;
import com.example.restaurantroulette.service.AuthService;
import com.example.restaurantroulette.service.NearbyPlacesService;
import com.example.restaurantroulette.service.PremiumService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/places")
public class PlacesController {
  private final NearbyPlacesService nearbyPlacesService;
  private final AuthService authService;
  private final PremiumService premiumService;
  private final AreaGeocodeService areaGeocodeService;

  public PlacesController(
      NearbyPlacesService nearbyPlacesService,
      AuthService authService,
      PremiumService premiumService,
      AreaGeocodeService areaGeocodeService) {
    this.nearbyPlacesService = nearbyPlacesService;
    this.authService = authService;
    this.premiumService = premiumService;
    this.areaGeocodeService = areaGeocodeService;
  }

  /**
   * エリア名から検索の中心座標を返す。
   * 端末側に座標を持っていない市区町村（ほぼ全部）で、抽選と地図の中心を正しい場所にするために使う。
   * 解決できない場合は 204 を返し、呼び出し側が「エリアを選び直す」案内を出せるようにする。
   */
  @GetMapping("/area-center")
  public ResponseEntity<AreaCenter> areaCenter(@RequestParam String area) {
    return areaGeocodeService.resolve(area)
        .map(ResponseEntity::ok)
        .orElseGet(() -> ResponseEntity.noContent().build());
  }

  @PostMapping("/nearby")
  public NearbyPlacesResponse nearby(
      @RequestBody NearbyPlacesRequest request,
      @RequestHeader(value = "Authorization", required = false) String authorizationHeader) {
    return nearbyPlacesService.search(request, isPremium(authorizationHeader));
  }

  private boolean isPremium(String authorizationHeader) {
    if (authorizationHeader == null || authorizationHeader.isBlank()) {
      return false;
    }
    try {
      String userId = authService.me(authorizationHeader).user().id();
      return premiumService.status(userId).isPro();
    } catch (RuntimeException exception) {
      return false;
    }
  }
}
