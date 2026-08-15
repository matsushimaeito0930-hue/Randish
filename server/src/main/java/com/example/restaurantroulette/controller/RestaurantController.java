package com.example.restaurantroulette.controller;

import com.example.restaurantroulette.dto.ApiDtos.RandomRestaurantRequest;
import com.example.restaurantroulette.dto.ApiDtos.RestaurantResponse;
import com.example.restaurantroulette.service.AuthenticatedUserService;
import com.example.restaurantroulette.service.ValidationService;
import com.example.restaurantroulette.service.RandomRestaurantService;
import com.example.restaurantroulette.service.PremiumService;
import com.example.restaurantroulette.service.RestaurantQueryService;
import com.example.restaurantroulette.service.RestaurantQueryService.GooglePlacesUsage;
import java.util.List;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/restaurants")
public class RestaurantController {
  private final RestaurantQueryService restaurantQueryService;
  private final RandomRestaurantService randomRestaurantService;
  private final AuthenticatedUserService authenticatedUserService;
  private final PremiumService premiumService;

  public RestaurantController(
      RestaurantQueryService restaurantQueryService,
      RandomRestaurantService randomRestaurantService,
      AuthenticatedUserService authenticatedUserService,
      PremiumService premiumService) {
    this.restaurantQueryService = restaurantQueryService;
    this.randomRestaurantService = randomRestaurantService;
    this.authenticatedUserService = authenticatedUserService;
    this.premiumService = premiumService;
  }

  @GetMapping
  public List<RestaurantResponse> findAll(
      @RequestHeader(value = "Authorization", required = false) String authorizationHeader,
      @RequestParam(value = "userId", required = false) String requestUserId,
      @RequestParam(required = false) String area,
      @RequestParam(required = false) String genre,
      @RequestParam(required = false) Integer budgetMin,
      @RequestParam(required = false) Integer budgetMax,
      @RequestParam(required = false) Double lat,
      @RequestParam(required = false) Double lng,
      @RequestParam(required = false) Double latitude,
      @RequestParam(required = false) Double longitude,
      @RequestParam(required = false) Integer range,
      @RequestParam(required = false) Integer radius,
      @RequestParam(required = false) Integer distanceMeters) {
    Double effectiveLatitude = latitude == null ? lat : latitude;
    Double effectiveLongitude = longitude == null ? lng : longitude;
    Integer effectiveRange = range == null && radius != null ? radiusToHotPepperRange(radius) : range;
    List<RestaurantResponse> restaurants = restaurantQueryService.search(
        area,
        genre,
        budgetMin,
        budgetMax,
        effectiveLatitude,
        effectiveLongitude,
        effectiveRange,
        resolveGooglePlacesUsage(authorizationHeader, requestUserId));
    if (effectiveLatitude == null || effectiveLongitude == null || distanceMeters == null || distanceMeters <= 0) {
      return restaurants;
    }
    return restaurants.stream()
        .filter(restaurant -> restaurant.latitude() != null && restaurant.longitude() != null)
        .filter(restaurant -> distanceMeters(
            effectiveLatitude,
            effectiveLongitude,
            restaurant.latitude(),
            restaurant.longitude()) <= distanceMeters)
        .toList();
  }

  @GetMapping("/random")
  public RestaurantResponse chooseRandom(
      @RequestHeader(value = "Authorization", required = false) String authorizationHeader,
      @RequestParam(required = false) String userId,
      @RequestParam(required = false) String area,
      @RequestParam(required = false) String genre,
      @RequestParam(required = false) Integer budgetMin,
      @RequestParam(required = false) Integer budgetMax,
      @RequestParam(required = false) Double lat,
      @RequestParam(required = false) Double lng,
      @RequestParam(required = false) Double latitude,
      @RequestParam(required = false) Double longitude,
      @RequestParam(required = false) Integer range,
      @RequestParam(required = false) Integer radius,
      @RequestParam(required = false) Integer distanceMeters) {
    String effectiveUserId = userId == null || userId.isBlank() ? ValidationService.GUEST_USER_ID : userId.trim();
    if (!authenticatedUserService.isGuestUserId(effectiveUserId)) {
      authenticatedUserService.requireSameUser(authorizationHeader, effectiveUserId);
    }
    Double effectiveLatitude = latitude == null ? lat : latitude;
    Double effectiveLongitude = longitude == null ? lng : longitude;
    Integer effectiveRange = range == null && radius != null ? radiusToHotPepperRange(radius) : range;
    return randomRestaurantService.choose(new RandomRestaurantRequest(
        effectiveUserId,
        area,
        genre,
        budgetMin,
        budgetMax,
        effectiveLatitude,
        effectiveLongitude,
        effectiveRange,
        distanceMeters));
  }

  @GetMapping("/{id}")
  public RestaurantResponse findById(@PathVariable String id) {
    return restaurantQueryService.findById(id);
  }

  /**
   * この検索で Google Places をどこまで使うかを決める。
   *
   * <p>Google だけが従量課金で、試算では1人あたりの原価の7割を占める。Premium と dev は
   * 件数が足りないぶんを補う形で使い、無料とゲストは他が1件も返せなかったときだけ使う。
   *
   * <p>認証に失敗しても検索そのものは止めない。ここで弾くと、トークンが切れているだけの人に
   * 店が1軒も出なくなる。分からないときは無料として扱う（多く見せることはあっても、
   * 他人の権限を借りることはない）。
   */
  private GooglePlacesUsage resolveGooglePlacesUsage(String authorizationHeader, String requestUserId) {
    String userId = requestUserId == null ? "" : requestUserId.trim();
    if (userId.isEmpty() || authenticatedUserService.isGuestUserId(userId)) {
      return GooglePlacesUsage.ONLY_WHEN_EMPTY;
    }
    try {
      authenticatedUserService.requireSameUser(authorizationHeader, userId);
      return premiumService.status(userId).isPro()
          ? GooglePlacesUsage.FILL_SHORTFALL
          : GooglePlacesUsage.ONLY_WHEN_EMPTY;
    } catch (RuntimeException exception) {
      return GooglePlacesUsage.ONLY_WHEN_EMPTY;
    }
  }

  private Integer radiusToHotPepperRange(Integer radiusMeters) {
    if (radiusMeters == null) {
      return null;
    }
    if (radiusMeters <= 300) {
      return 1;
    }
    if (radiusMeters <= 500) {
      return 2;
    }
    if (radiusMeters <= 1000) {
      return 3;
    }
    if (radiusMeters <= 2000) {
      return 4;
    }
    return 5;
  }

  private int distanceMeters(double fromLatitude, double fromLongitude, double toLatitude, double toLongitude) {
    double earthRadiusMeters = 6_371_000;
    double latitudeDelta = Math.toRadians(toLatitude - fromLatitude);
    double longitudeDelta = Math.toRadians(toLongitude - fromLongitude);
    double fromLatitudeRad = Math.toRadians(fromLatitude);
    double toLatitudeRad = Math.toRadians(toLatitude);
    double haversine = Math.sin(latitudeDelta / 2) * Math.sin(latitudeDelta / 2)
        + Math.cos(fromLatitudeRad) * Math.cos(toLatitudeRad)
        * Math.sin(longitudeDelta / 2) * Math.sin(longitudeDelta / 2);
    return (int) Math.round(earthRadiusMeters * 2
        * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine)));
  }
}
