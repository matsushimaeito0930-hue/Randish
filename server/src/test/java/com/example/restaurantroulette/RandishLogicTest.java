package com.example.restaurantroulette;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.example.restaurantroulette.dto.ApiDtos.AuthResponse;
import com.example.restaurantroulette.dto.ApiDtos.CandidatePlaceResponse;
import com.example.restaurantroulette.dto.ApiDtos.FavoriteCreateRequest;
import com.example.restaurantroulette.dto.ApiDtos.NearbyPlacesRequest;
import com.example.restaurantroulette.dto.ApiDtos.PhotoAttributionResponse;
import com.example.restaurantroulette.dto.ApiDtos.RandomHistoryCreateRequest;
import com.example.restaurantroulette.dto.ApiDtos.RandomHistoryRatingRequest;
import com.example.restaurantroulette.dto.ApiDtos.RandomRestaurantRequest;
import com.example.restaurantroulette.dto.ApiDtos.RestaurantResponse;
import com.example.restaurantroulette.dto.ApiDtos.UserCreateRequest;
import com.example.restaurantroulette.dto.ApiDtos.UserResponse;
import com.example.restaurantroulette.dto.ApiDtos.VisitCreateRequest;
import com.example.restaurantroulette.entity.PendingEmailRegistration;
import com.example.restaurantroulette.entity.Restaurant;
import com.example.restaurantroulette.exception.BadRequestException;
import com.example.restaurantroulette.exception.ConflictException;
import com.example.restaurantroulette.exception.UnauthorizedException;
import com.example.restaurantroulette.repository.AppUserRepository;
import com.example.restaurantroulette.repository.FavoriteRestaurantRepository;
import com.example.restaurantroulette.repository.PendingEmailRegistrationRepository;
import com.example.restaurantroulette.repository.PremiumRepository;
import com.example.restaurantroulette.repository.RandomHistoryRepository;
import com.example.restaurantroulette.repository.RevenueCatWebhookRepository;
import com.example.restaurantroulette.repository.RestaurantRepository;
import com.example.restaurantroulette.repository.VisitCollectionRepository;
import com.example.restaurantroulette.service.AuthService;
import com.example.restaurantroulette.service.AuthenticatedUserService;
import com.example.restaurantroulette.service.DtoMapper;
import com.example.restaurantroulette.service.EmailRegistrationService;
import com.example.restaurantroulette.service.FavoriteService;
import com.example.restaurantroulette.service.LocalSessionService;
import com.example.restaurantroulette.service.NearbyPlacesService;
import com.example.restaurantroulette.service.PasswordHashService;
import com.example.restaurantroulette.service.PremiumService;
import com.example.restaurantroulette.service.RandomHistoryService;
import com.example.restaurantroulette.service.RandomRestaurantService;
import com.example.restaurantroulette.service.RevenueCatWebhookService;
import com.example.restaurantroulette.service.RestaurantQueryService;
import com.example.restaurantroulette.service.StatisticsService;
import com.example.restaurantroulette.service.SupabaseAuthService;
import com.example.restaurantroulette.service.UserService;
import com.example.restaurantroulette.service.ValidationService;
import com.example.restaurantroulette.service.VisitCollectionService;
import com.example.restaurantroulette.service.external.ExternalRestaurantProvider;
import com.example.restaurantroulette.service.external.GooglePlacesEnrichmentService;
import com.example.restaurantroulette.service.external.HotPepperRestaurantProvider;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.lang.reflect.Method;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.security.MessageDigest;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Base64;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.regex.Pattern;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.jdbc.datasource.embedded.EmbeddedDatabaseBuilder;
import org.springframework.jdbc.datasource.embedded.EmbeddedDatabaseType;
import org.springframework.web.client.RestClient;

class RandishLogicTest {
  private final JdbcClient jdbcClient = JdbcClient.create(new EmbeddedDatabaseBuilder()
      .setType(EmbeddedDatabaseType.H2)
      .addScript("schema.sql")
      .build());
  private final RestaurantRepository restaurantRepository = new RestaurantRepository(jdbcClient);
  private final DtoMapper mapper = new DtoMapper();
  private final ValidationService validationService = new ValidationService();
  private final RestaurantQueryService restaurantQueryService = new RestaurantQueryService(
      restaurantRepository,
      List.of(),
      mapper,
      validationService);
  private final RandomHistoryService randomHistoryService = new RandomHistoryService(new RandomHistoryRepository(jdbcClient), restaurantQueryService, mapper, validationService);
  private final RandomRestaurantService randomRestaurantService = new RandomRestaurantService(
      restaurantQueryService,
      randomHistoryService,
      mapper,
      validationService);
  private final FavoriteService favoriteService = new FavoriteService(new FavoriteRestaurantRepository(jdbcClient), restaurantQueryService, mapper, validationService);
  private final PasswordHashService passwordHashService = new PasswordHashService();
  private final UserService userService = new UserService(new AppUserRepository(jdbcClient), mapper, passwordHashService);
  private final PremiumService premiumService = new PremiumService(new PremiumRepository(jdbcClient));
  private final VisitCollectionService visitCollectionService = new VisitCollectionService(new VisitCollectionRepository(jdbcClient), restaurantQueryService, mapper, validationService);
  private final StatisticsService statisticsService = new StatisticsService(visitCollectionService, restaurantQueryService, favoriteService, validationService);

  @Test
  void searchCanFilterRestaurants() {
    var restaurants = restaurantQueryService.search("梅田", "ラーメン", 1000, 2000);

    assertThat(restaurants).isNotEmpty();
    assertThat(restaurants).allMatch(restaurant -> restaurant.area().equals("梅田"));
    assertThat(restaurants).allMatch(restaurant -> restaurant.genre().equals("ラーメン"));
  }

  @Test
  void searchFiltersByAverageBudget() {
    var budgetLimitMatch = restaurantQueryService.search("梅田", "ラーメン", 0, 1000);
    var budgetLimitTooLow = restaurantQueryService.search("梅田", "ラーメン", 0, 800);
    var matching = restaurantQueryService.search("梅田", "ラーメン", 1000, 1200);
    var tooHigh = restaurantQueryService.search("梅田", "ラーメン", 1300, 1500);

    assertThat(budgetLimitMatch).extracting("id").contains("seed-umeda-ramen");
    assertThat(budgetLimitTooLow).extracting("id").doesNotContain("seed-umeda-ramen");
    assertThat(matching).extracting("id").contains("seed-umeda-ramen");
    assertThat(tooHigh).extracting("id").doesNotContain("seed-umeda-ramen");
  }

  @Test
  void randomSavesHistory() {
    var selected = randomRestaurantService.choose(new RandomRestaurantRequest("user-1", "梅田", null, null, null, null, null, null, null));
    var histories = randomHistoryService.findByUserId("user-1");

    assertThat(selected.id()).isNotBlank();
    assertThat(histories).hasSize(1);
    assertThat(histories.getFirst().restaurant().id()).isEqualTo(selected.id());
  }

  @Test
  void randomAppliesExactDistanceMeters() {
    RestaurantQueryService queryService = Mockito.mock(RestaurantQueryService.class);
    RandomHistoryService historyService = Mockito.mock(RandomHistoryService.class);
    Restaurant near = new Restaurant(
        "near",
        "HOTPEPPER",
        "near",
        "Near restaurant",
        "Tokyo",
        "cafe",
        1000,
        2000,
        0,
        0,
        "near",
        "https://example.com/near.jpg",
        "",
        35.68125,
        139.7671);
    Restaurant far = new Restaurant(
        "far",
        "HOTPEPPER",
        "far",
        "Far restaurant",
        "Tokyo",
        "cafe",
        1000,
        2000,
        0,
        0,
        "far",
        "https://example.com/far.jpg",
        "",
        35.6912,
        139.7671);
    Mockito.when(queryService.searchRandomEntities(null, "cafe", 0, 2000, 35.6812, 139.7671, 1, 360,
            RestaurantQueryService.GooglePlacesUsage.ONLY_WHEN_EMPTY))
        .thenReturn(List.of(near, far));
    RandomRestaurantService service = new RandomRestaurantService(queryService, historyService, mapper, validationService);

    var selected = service.choose(new RandomRestaurantRequest(
        ValidationService.GUEST_USER_ID,
        null,
        "cafe",
        0,
        2000,
        35.6812,
        139.7671,
        1,
        100));

    assertThat(selected.id()).isEqualTo("near");
  }

  @Test
  void randomPrefersCandidateWithDisplayablePhoto() {
    RestaurantQueryService queryService = Mockito.mock(RestaurantQueryService.class);
    RandomHistoryService historyService = Mockito.mock(RandomHistoryService.class);
    Restaurant withoutPhoto = new Restaurant(
        "without-photo",
        "GEOAPIFY",
        "without-photo",
        "No photo",
        "Tokyo",
        "cafe",
        1000,
        2000,
        0,
        0,
        "address",
        null,
        "",
        35.6812,
        139.7671);
    Restaurant withPhoto = new Restaurant(
        "with-photo",
        "HOTPEPPER",
        "with-photo",
        "With photo",
        "Tokyo",
        "cafe",
        1000,
        2000,
        0,
        0,
        "address",
        "https://example.com/photo.jpg",
        "",
        35.6812,
        139.7671);
    Mockito.when(queryService.searchRandomEntities(null, "cafe", 0, 2000, null, null, null, 360,
            RestaurantQueryService.GooglePlacesUsage.ONLY_WHEN_EMPTY))
        .thenReturn(List.of(withoutPhoto, withPhoto));
    var enrichmentService = new CountingEnrichmentService();
    RandomRestaurantService service = new RandomRestaurantService(
        queryService,
        historyService,
        mapper,
        validationService,
        enrichmentService);

    var selected = service.choose(new RandomRestaurantRequest(
        ValidationService.GUEST_USER_ID,
        null,
        "cafe",
        0,
        2000,
        null,
        null,
        null,
        null));

    assertThat(selected.id()).isEqualTo("with-photo");
    assertThat(selected.photoUrl()).isEqualTo("https://example.com/photo.jpg");
    assertThat(enrichmentService.enrichCallCount).isEqualTo(1);
  }

  @Test
  void registerUserPersistsInDatabase() {
    var user = userService.register(new UserCreateRequest("RANDISH@example.com", "password123", "Randish User"));
    var found = userService.findById(user.id());

    assertThat(found.id()).isEqualTo(user.id());
    assertThat(found.email()).isEqualTo("randish@example.com");
    assertThat(found.displayName()).isEqualTo("Randish User");
    assertThat(found.authProvider()).isEqualTo("EMAIL");
  }

  @Test
  void registerUserFallsBackToEmailNameWhenDisplayNameIsBlank() {
    var user = userService.register(new UserCreateRequest("fallback.name@example.com", "password123", " "));

    assertThat(user.displayName()).isEqualTo("fallback.name");
  }

  @Test
  void registerUserPreventsDuplicateEmail() {
    userService.register(new UserCreateRequest("duplicate@example.com", "password123", "First"));

    assertThatThrownBy(() -> userService.register(new UserCreateRequest("DUPLICATE@example.com", "password123", "Second")))
        .isInstanceOf(ConflictException.class);
  }

  @Test
  void registerUserRejectsInvalidEmailBeforeProviderCall() {
    assertThatThrownBy(() -> userService.register(new UserCreateRequest("eito@eito", "password123", "Eito")))
        .isInstanceOf(BadRequestException.class);
  }

  @Test
  void premiumStatusUsesActiveGrant() {
    UserResponse user = userService.register(new UserCreateRequest("premium-grant@example.com", "password123", "Premium Grant"));
    jdbcClient.sql("""
        INSERT INTO premium_grants (
          id, user_id, entitlement_key, grant_type, status, starts_at, ends_at, note
        )
        VALUES (
          'grant-active-test', :userId, 'premium', 'BETA', 'active', :startsAt, :endsAt, 'test grant'
        )
        """)
        .param("userId", user.id())
        .param("startsAt", java.sql.Timestamp.from(Instant.now().minusSeconds(60)))
        .param("endsAt", java.sql.Timestamp.from(Instant.now().plusSeconds(3600)))
        .update();

    var status = premiumService.status(user.id());

    assertThat(status.isPro()).isTrue();
    assertThat(status.source()).isEqualTo("GRANT");
    assertThat(status.entitlementKey()).isEqualTo("premium");
  }

  @Test
  void premiumStatusIgnoresExpiredGrant() {
    UserResponse user = userService.register(new UserCreateRequest("premium-expired@example.com", "password123", "Premium Expired"));
    jdbcClient.sql("""
        INSERT INTO premium_grants (
          id, user_id, entitlement_key, grant_type, status, starts_at, ends_at, note
        )
        VALUES (
          'grant-expired-test', :userId, 'premium', 'BETA', 'active', :startsAt, :endsAt, 'expired grant'
        )
        """)
        .param("userId", user.id())
        .param("startsAt", java.sql.Timestamp.from(Instant.now().minusSeconds(7200)))
        .param("endsAt", java.sql.Timestamp.from(Instant.now().minusSeconds(3600)))
        .update();

    var status = premiumService.status(user.id());

    assertThat(status.isPro()).isFalse();
    assertThat(status.source()).isEqualTo("FREE");
  }

  @Test
  void revenueCatWebhookActivatesPremiumSubscriptionIdempotently() throws Exception {
    System.setProperty("REVENUECAT_WEBHOOK_AUTHORIZATION", "Bearer revenuecat-test-secret");
    try {
      UserResponse user = userService.register(new UserCreateRequest("revenuecat-paid@example.com", "password123", "RevenueCat Paid"));
      ObjectMapper objectMapper = new ObjectMapper();
      RevenueCatWebhookService webhookService = new RevenueCatWebhookService(
          new RevenueCatWebhookRepository(jdbcClient),
          objectMapper);
      long nowMs = Instant.now().toEpochMilli();
      long expirationMs = Instant.now().plusSeconds(3600).toEpochMilli();
      var payload = objectMapper.readTree("""
          {
            "api_version": "1.0",
            "event": {
              "id": "event-paid-1",
              "type": "INITIAL_PURCHASE",
              "app_user_id": "%s",
              "original_app_user_id": "%s",
              "aliases": [],
              "store": "APP_STORE",
              "environment": "SANDBOX",
              "entitlement_id": "premium",
              "entitlement_ids": ["premium"],
              "product_id": "randish_pro_monthly",
              "period_type": "NORMAL",
              "event_timestamp_ms": %d,
              "purchased_at_ms": %d,
              "expiration_at_ms": %d,
              "transaction_id": "txn-paid-1",
              "original_transaction_id": "orig-paid-1"
            }
          }
          """.formatted(user.id(), user.id(), nowMs, nowMs, expirationMs));

      webhookService.handle("Bearer revenuecat-test-secret", payload);
      webhookService.handle("Bearer revenuecat-test-secret", payload);

      var status = premiumService.status(user.id());
      Long subscriptionRows = jdbcClient.sql("SELECT COUNT(*) FROM subscriptions WHERE user_id = :userId")
          .param("userId", user.id())
          .query(Long.class)
          .single();
      Long eventRows = jdbcClient.sql("SELECT COUNT(*) FROM payment_events WHERE provider_event_id = 'event-paid-1'")
          .query(Long.class)
          .single();

      assertThat(status.isPro()).isTrue();
      assertThat(status.source()).isEqualTo("SUBSCRIPTION");
      assertThat(status.provider()).isEqualTo("APP_STORE");
      assertThat(status.environment()).isEqualTo("SANDBOX");
      assertThat(subscriptionRows).isEqualTo(1);
      assertThat(eventRows).isEqualTo(1);
    } finally {
      System.clearProperty("REVENUECAT_WEBHOOK_AUTHORIZATION");
    }
  }

  @Test
  void revenueCatWebhookRejectsWrongAuthorization() throws Exception {
    System.setProperty("REVENUECAT_WEBHOOK_AUTHORIZATION", "Bearer revenuecat-test-secret");
    try {
      RevenueCatWebhookService webhookService = new RevenueCatWebhookService(
          new RevenueCatWebhookRepository(jdbcClient),
          new ObjectMapper());
      var payload = new ObjectMapper().readTree("""
          {
            "api_version": "1.0",
            "event": {
              "id": "event-unauthorized",
              "type": "INITIAL_PURCHASE",
              "app_user_id": "missing",
              "store": "APP_STORE",
              "environment": "SANDBOX",
              "entitlement_ids": ["premium"],
              "transaction_id": "txn-unauthorized"
            }
          }
          """);

      assertThatThrownBy(() -> webhookService.handle("Bearer wrong", payload))
          .isInstanceOf(UnauthorizedException.class);
    } finally {
      System.clearProperty("REVENUECAT_WEBHOOK_AUTHORIZATION");
    }
  }

  @Test
  void localAuthCanLoginWhenSupabaseIsNotConfigured() {
    UserResponse registered = userService.register(new UserCreateRequest("local-login@example.com", "password123", "Local User"));
    AuthService authService = new AuthService(userService, new SupabaseAuthService(RestClient.builder()), new LocalSessionService());

    AuthResponse loggedIn = authService.login(new com.example.restaurantroulette.dto.ApiDtos.UserLoginRequest(
        "LOCAL-LOGIN@example.com",
        "password123"));

    assertThat(loggedIn.user().id()).isEqualTo(registered.id());
    assertThat(loggedIn.user().email()).isEqualTo("local-login@example.com");
    assertThat(loggedIn.accessToken()).isNotBlank();
    assertThat(authService.me("Bearer " + loggedIn.accessToken()).user().id()).isEqualTo(registered.id());
  }

  @Test
  void localAuthCanLoginWithAnExistingShortPassword() {
    String existingPassword = "abc123";
    PasswordHashService.PasswordSecret secret = passwordHashService.hash(existingPassword);
    UserResponse registered = userService.registerVerifiedEmail(
        "legacy-short-password@example.com",
        "Legacy User",
        secret.hash(),
        secret.salt());
    AuthService authService = new AuthService(userService, new SupabaseAuthService(RestClient.builder()), new LocalSessionService());

    AuthResponse loggedIn = authService.login(new com.example.restaurantroulette.dto.ApiDtos.UserLoginRequest(
        "legacy-short-password@example.com",
        existingPassword));

    assertThat(loggedIn.user().id()).isEqualTo(registered.id());
    assertThat(loggedIn.accessToken()).isNotBlank();
  }

  @Test
  void localAuthLogoutRevokesSession() {
    userService.register(new UserCreateRequest("local-logout@example.com", "password123", "Local User"));
    AuthService authService = new AuthService(userService, new SupabaseAuthService(RestClient.builder()), new LocalSessionService());

    AuthResponse loggedIn = authService.login(new com.example.restaurantroulette.dto.ApiDtos.UserLoginRequest(
        "local-logout@example.com",
        "password123"));

    authService.logout("Bearer " + loggedIn.accessToken());

    assertThatThrownBy(() -> authService.me("Bearer " + loggedIn.accessToken()))
        .isInstanceOf(UnauthorizedException.class);
  }

  @Test
  void localAuthRejectsWrongPassword() {
    userService.register(new UserCreateRequest("wrong-password@example.com", "password123", "Local User"));
    AuthService authService = new AuthService(userService, new SupabaseAuthService(RestClient.builder()), new LocalSessionService());

    assertThatThrownBy(() -> authService.login(new com.example.restaurantroulette.dto.ApiDtos.UserLoginRequest(
        "wrong-password@example.com",
        "password124")))
        .isInstanceOf(UnauthorizedException.class);
  }

  @Test
  void localAuthCanLoginBeforeSupabaseWhenSupabaseIsConfigured() {
    System.setProperty("SUPABASE_URL", "https://randish-test.supabase.co");
    System.setProperty("SUPABASE_ANON_KEY", "anon-test-key");
    try {
      UserResponse registered = userService.register(new UserCreateRequest("local-first@example.com", "password123", "Local First"));
      AuthService authService = new AuthService(userService, new SupabaseAuthService(RestClient.builder()), new LocalSessionService());

      AuthResponse loggedIn = authService.login(new com.example.restaurantroulette.dto.ApiDtos.UserLoginRequest(
          "LOCAL-FIRST@example.com",
          "password123"));

      assertThat(loggedIn.user().id()).isEqualTo(registered.id());
      assertThat(loggedIn.accessToken()).isNotBlank();
    } finally {
      System.clearProperty("SUPABASE_URL");
      System.clearProperty("SUPABASE_ANON_KEY");
    }
  }

  @Test
  void emailVerificationCreatesUserAndSessionFromMagicLink() throws Exception {
    String token = "magic-link-token";
    PasswordHashService.PasswordSecret secret = passwordHashService.hash("unused-secret");
    PendingEmailRegistrationRepository pendingRepository = new PendingEmailRegistrationRepository(jdbcClient);
    LocalSessionService localSessionService = new LocalSessionService();
    EmailRegistrationService emailRegistrationService = new EmailRegistrationService(
        pendingRepository,
        userService,
        passwordHashService,
        localSessionService,
        RestClient.builder());
    Instant now = Instant.now();
    pendingRepository.save(new PendingEmailRegistration(
        "pending-magic-link",
        "magic-link@example.com",
        "Magic Link",
        secret.hash(),
        secret.salt(),
        sha256Base64Url(token),
        now.plusSeconds(600),
        null,
        now));

    AuthResponse auth = emailRegistrationService.verifyRegistration(token);

    assertThat(auth.user().email()).isEqualTo("magic-link@example.com");
    assertThat(auth.accessToken()).isNotBlank();
    assertThat(localSessionService.authenticate("Bearer " + auth.accessToken())).isEqualTo(auth.user().id());
    assertThat(userService.findByEmail("MAGIC-LINK@example.com")).isPresent();
  }

  @Test
  void supabaseUserSyncMergesExistingEmailAccount() {
    UserResponse localUser = userService.register(new UserCreateRequest("google-merge@example.com", "password123", "Local User"));
    var supabaseUser = new SupabaseAuthService.SupabaseAuthUser(
        "supabase-user-id",
        "google-merge@example.com",
        Map.of("name", "Google User"),
        null);

    UserResponse synced = userService.syncSupabaseUser(supabaseUser, null);

    assertThat(synced.id()).isEqualTo(localUser.id());
    assertThat(synced.email()).isEqualTo("google-merge@example.com");
    assertThat(synced.displayName()).isEqualTo("Google User");
    assertThat(synced.authProvider()).isEqualTo("SUPABASE");
    assertThat(userService.findByEmail("google-merge@example.com").orElseThrow().id()).isEqualTo(localUser.id());
  }

  @Test
  void favoritePreventsDuplicates() {
    favoriteService.create(new FavoriteCreateRequest("user-1", "seed-umeda-ramen"));

    assertThatThrownBy(() -> favoriteService.create(new FavoriteCreateRequest("user-1", "seed-umeda-ramen")))
        .isInstanceOf(ConflictException.class);
  }

  @Test
  void externalFavoritesAndHistoriesStoreOnlyProviderIdAndReloadDetailsOnDemand() {
    ExternalRestaurantProvider provider = Mockito.mock(ExternalRestaurantProvider.class);
    Restaurant externalRestaurant = new Restaurant(
        "hotpepper-J000000001",
        "HOTPEPPER",
        "J000000001",
        "APIから再取得した店舗",
        "大阪",
        "居酒屋",
        2000,
        4000,
        4.0,
        5,
        "大阪府大阪市",
        "https://example.com/shop.jpg",
        "test",
        34.7,
        135.5);
    Mockito.when(provider.providerKey()).thenReturn("HOTPEPPER");
    Mockito.when(provider.isAvailable()).thenReturn(true);
    Mockito.when(provider.findByExternalId("J000000001", "大阪", "居酒屋", 2000, 4000))
        .thenReturn(java.util.Optional.of(externalRestaurant));
    RestaurantQueryService queryService = new RestaurantQueryService(
        restaurantRepository,
        List.of(provider),
        mapper,
        validationService);
    FavoriteService externalFavoriteService = new FavoriteService(
        new FavoriteRestaurantRepository(jdbcClient),
        queryService,
        mapper,
        validationService);
    RandomHistoryService externalHistoryService = new RandomHistoryService(
        new RandomHistoryRepository(jdbcClient),
        queryService,
        mapper,
        validationService);

    var favorite = externalFavoriteService.create(new FavoriteCreateRequest(
        "user-external",
        null,
        "HOTPEPPER",
        "J000000001",
        "大阪",
        "居酒屋",
        2000,
        4000,
        3000,
        null,
        null));
    var history = externalHistoryService.create(new RandomHistoryCreateRequest(
        "user-external",
        null,
        "HOTPEPPER",
        "J000000001",
        "大阪",
        "居酒屋",
        2000,
        4000,
        3000));

    assertThat(favorite.restaurantId()).isNull();
    assertThat(favorite.restaurant()).isNull();
    assertThat(history.restaurantId()).isNull();
    assertThat(history.restaurant()).isNull();
    assertThat(externalFavoriteService.findRestaurant(favorite.id()).name()).isEqualTo("APIから再取得した店舗");
    assertThat(externalHistoryService.findRestaurant(history.id()).name()).isEqualTo("APIから再取得した店舗");
  }

  @Test
  void randomHistoryRatingCanBeSavedChangedAndCleared() {
    var history = randomHistoryService.create(new RandomHistoryCreateRequest(
        "user-history-rating",
        "seed-umeda-ramen",
        null,
        null,
        "梅田",
        "ラーメン",
        1000,
        1500,
        1500));

    var rated = randomHistoryService.updateRating(history.id(), new RandomHistoryRatingRequest(5));
    assertThat(rated.userRating()).isEqualTo(5);
    assertThat(randomHistoryService.findByUserId("user-history-rating").get(0).userRating()).isEqualTo(5);

    var cleared = randomHistoryService.updateRating(history.id(), new RandomHistoryRatingRequest(0));
    assertThat(cleared.userRating()).isNull();
  }

  @Test
  void randomHistoryRatingRejectsValuesOutsideFiveStars() {
    var history = randomHistoryService.create(new RandomHistoryCreateRequest(
        "user-history-invalid-rating",
        "seed-umeda-ramen",
        null,
        null,
        null,
        null,
        null,
        null,
        null));

    assertThatThrownBy(() -> randomHistoryService.updateRating(history.id(), new RandomHistoryRatingRequest(6)))
        .isInstanceOf(BadRequestException.class)
        .hasMessageContaining("between 1 and 5");
  }

  @Test
  void visitCreatesCollectionAndStatistics() {
    visitCollectionService.create(new VisitCreateRequest("user-visit", "seed-umeda-ramen", null, null, "good", 5));
    favoriteService.create(new FavoriteCreateRequest("user-visit", "seed-umeda-ramen"));

    var statistics = statisticsService.calculate("user-visit");

    assertThat(statistics.totalVisits()).isEqualTo(1);
    assertThat(statistics.visitedRestaurantCount()).isEqualTo(1);
    assertThat(statistics.favoriteGenre()).isEqualTo("ラーメン");
    assertThat(statistics.favoriteCount()).isEqualTo(1);
  }

  @Test
  void repeatedVisitsAreTrackedWithoutDuplicatingVisitedRestaurants() {
    visitCollectionService.create(new VisitCreateRequest("user-repeat", "seed-umeda-ramen", null, null, "first", 5));
    visitCollectionService.create(new VisitCreateRequest("user-repeat", "seed-umeda-ramen", null, null, "again", 4));

    var visits = visitCollectionService.findByUserId("user-repeat");
    var statistics = statisticsService.calculate("user-repeat");

    assertThat(visits).hasSize(2);
    assertThat(statistics.totalVisits()).isEqualTo(2);
    assertThat(statistics.visitedRestaurantCount()).isEqualTo(1);
  }

  @Test
  void restaurantResyncKeepsDependentUserData() {
    favoriteService.create(new FavoriteCreateRequest("user-resync", "seed-umeda-ramen"));

    new RestaurantRepository(jdbcClient);

    assertThat(favoriteService.findByUserId("user-resync")).hasSize(1);
  }

  @Test
  void hybridFallbackOnlyFillsMissingSlots() {
    var hotPepperLikeProvider = new FixedProvider("hotpepper", false, 70);
    var googleLikeProvider = new FixedProvider("google", true, 100);
    var hybridQueryService = new RestaurantQueryService(
        restaurantRepository,
        List.of(hotPepperLikeProvider, googleLikeProvider),
        mapper,
        validationService);

    var restaurants = hybridQueryService.searchRandomEntities("東成区", "ラーメン", 0, 2000, null, null, null, 100, true);

    assertThat(restaurants).hasSize(100);
    assertThat(restaurants.stream().filter(restaurant -> restaurant.externalProvider().equals("HOTPEPPER")).count()).isEqualTo(70);
    assertThat(restaurants.stream().filter(restaurant -> restaurant.externalProvider().equals("GOOGLE_PLACES")).count()).isEqualTo(30);
    assertThat(hotPepperLikeProvider.lastRandomMaxCandidates).isEqualTo(100);
    assertThat(googleLikeProvider.lastRandomMaxCandidates).isEqualTo(30);
  }

  @Test
  void hybridDoesNotUseFallbackWhenPrimaryHasEnoughCandidates() {
    var hotPepperLikeProvider = new FixedProvider("hotpepper", false, 120);
    var googleLikeProvider = new FixedProvider("google", true, 100);
    var hybridQueryService = new RestaurantQueryService(
        restaurantRepository,
        List.of(hotPepperLikeProvider, googleLikeProvider),
        mapper,
        validationService);

    var restaurants = hybridQueryService.searchRandomEntities("東成区", "ラーメン", 0, 2000, null, null, null, 100);

    assertThat(restaurants).hasSize(100);
    assertThat(restaurants).allMatch(restaurant -> restaurant.externalProvider().equals("HOTPEPPER"));
    assertThat(googleLikeProvider.randomCallCount).isZero();
  }

  @Test
  void geoapifyPrimarySupplementsWhenHotPepperIsEmpty() {
    var hotPepperLikeProvider = new NamedProvider(List.of());
    var geoapifyLikeProvider = new NamedProvider(List.of(new Restaurant(
        "geoapify-hal-ramen",
        "GEOAPIFY",
        "geoapify-place-1",
        "HAL Ramen",
        "Osaka",
        "ramen",
        700,
        1500,
        0,
        0,
        "Osaka Umeda",
        null,
        "test",
        34.699826,
        135.49311)));
    var hybridQueryService = new RestaurantQueryService(
        restaurantRepository,
        List.of(hotPepperLikeProvider, geoapifyLikeProvider),
        mapper,
        validationService);

    var restaurants = hybridQueryService.searchRandomEntities("Osaka", "ramen", 0, 2000, 34.699826, 135.49311, 2, 20);

    assertThat(restaurants).hasSize(1);
    assertThat(restaurants.getFirst().externalProvider()).isEqualTo("GEOAPIFY");
    assertThat(hotPepperLikeProvider.randomCallCount).isEqualTo(1);
    assertThat(geoapifyLikeProvider.randomCallCount).isEqualTo(1);
  }

  @Test
  void duplicateRestaurantsUseNearbyCoordinates() {
    var hotPepperLikeProvider = new NamedProvider(List.of(new Restaurant(
        "hotpepper-hal-ramen",
        "HOTPEPPER",
        "hotpepper-place-1",
        "Ramen HAL",
        "Osaka",
        "ramen",
        700,
        1500,
        0,
        0,
        "Osaka Umeda 1",
        null,
        "test",
        34.699826,
        135.49311)));
    var geoapifyLikeProvider = new NamedProvider(List.of(new Restaurant(
        "geoapify-hal-ramen",
        "GEOAPIFY",
        "geoapify-place-1",
        "Ramen HAL Osaka",
        "Osaka",
        "ramen",
        700,
        1500,
        0,
        0,
        "Different nearby address",
        null,
        "test",
        34.699830,
        135.49315)));
    var hybridQueryService = new RestaurantQueryService(
        restaurantRepository,
        List.of(hotPepperLikeProvider, geoapifyLikeProvider),
        mapper,
        validationService);

    var restaurants = hybridQueryService.searchEntities("Osaka", "ramen", 0, 2000, 34.699826, 135.49311, 2);

    assertThat(restaurants).hasSize(1);
    assertThat(restaurants.getFirst().externalProvider()).isEqualTo("HOTPEPPER");
  }

  @Test
  void restaurantProvidersAreQueriedInCostControlledOrder() {
    var callOrder = new ArrayList<String>();
    var googleProvider = new OrderedProvider("GOOGLE_PLACES", true, callOrder);
    var geoapifyProvider = new OrderedProvider("GEOAPIFY", false, callOrder);
    var hotPepperProvider = new OrderedProvider("HOTPEPPER", false, callOrder);
    var service = new RestaurantQueryService(
        restaurantRepository,
        List.of(googleProvider, geoapifyProvider, hotPepperProvider),
        mapper,
        validationService);

    var restaurants = service.searchRandomEntities("出雲市", "ラーメン", 0, 2000, 35.360748, 132.756697, 4, 3, true);

    assertThat(callOrder).containsExactly("HOTPEPPER", "GEOAPIFY", "GOOGLE_PLACES");
    assertThat(restaurants).extracting("externalProvider").containsExactly("HOTPEPPER", "GEOAPIFY", "GOOGLE_PLACES");
  }

  @Test
  void mobileInitialGenreCatalogIsCuratedAndUnique() throws Exception {
    String source = Files.readString(Path.of("..", "mobile", "src", "AppRoot.tsx"));
    String catalog = source.substring(source.indexOf("const GENRES"), source.indexOf("const AI_REPORT_MONTHLY_NOTICE"));
    var matcher = Pattern.compile("\\{ label: '([^']+)'").matcher(catalog);
    var labels = new ArrayList<String>();
    while (matcher.find()) {
      labels.add(matcher.group(1));
    }

    assertThat(labels).containsExactly(
        "すべて",
        "ラーメン",
        "焼肉",
        "居酒屋",
        "韓国料理",
        "カレー",
        "うどん",
        "そば",
        "粉もの",
        "焼き鳥",
        "ピザ",
        "定食",
        "餃子",
        "中華",
        "寿司",
        "海鮮",
        "洋食",
        "イタリアン",
        "カフェ",
        "スイーツ",
        "郷土料理",
        "その他");
    assertThat(new LinkedHashSet<>(labels)).hasSameSizeAs(labels);
    assertThat(labels).allMatch(label -> label != null && !label.isBlank());
    assertThat(labels).doesNotContain("スープ", "サラダ・野菜", "パン", "各国料理", "肉料理", "ファストフード", "串カツ");
  }

  @Test
  void hotPepperGenrePlansExpandMergedAndLegacyGenres() throws Exception {
    HotPepperRestaurantProvider provider = new HotPepperRestaurantProvider(RestClient.builder(), new ObjectMapper());
    Method buildSearchPlans = HotPepperRestaurantProvider.class.getDeclaredMethod("buildSearchPlans", String.class);
    buildSearchPlans.setAccessible(true);

    List<?> ramenPlans = (List<?>) buildSearchPlans.invoke(provider, "ラーメン");
    assertThat(ramenPlans).hasSizeGreaterThanOrEqualTo(4);
    assertThat(ramenPlans.toString()).contains("G013", "ラーメン", "つけ麺", "中華そば");

    List<?> powderPlans = (List<?>) buildSearchPlans.invoke(provider, "粉もの");
    assertThat(powderPlans).hasSizeGreaterThanOrEqualTo(3);
    assertThat(powderPlans.toString()).contains("お好み焼き", "たこ焼き", "もんじゃ");

    List<?> legacyPlans = (List<?>) buildSearchPlans.invoke(provider, "お好み焼き");
    assertThat(legacyPlans).isNotEmpty();
    assertThat(legacyPlans.toString()).contains("お好み焼き");
  }

  @Test
  void hotPepperGenreMatcherAcceptsMergedAndLegacyGenres() throws Exception {
    HotPepperRestaurantProvider provider = new HotPepperRestaurantProvider(RestClient.builder(), new ObjectMapper());
    Method matchesRequestedGenre = HotPepperRestaurantProvider.class.getDeclaredMethod("matchesRequestedGenre", Restaurant.class, String.class);
    matchesRequestedGenre.setAccessible(true);
    Restaurant okonomiyaki = new Restaurant(
        "test-okonomiyaki",
        "HOTPEPPER",
        "test-okonomiyaki",
        "大阪お好み焼き まち焼き",
        "大阪",
        "お好み焼き・もんじゃ",
        1000,
        2500,
        0,
        0,
        "大阪府大阪市",
        null,
        "鉄板の粉もの",
        null,
        null);
    Restaurant takoyaki = new Restaurant(
        "test-takoyaki",
        "HOTPEPPER",
        "test-takoyaki",
        "たこ焼き まる",
        "大阪",
        "お好み焼き・もんじゃ",
        500,
        1200,
        0,
        0,
        "大阪府大阪市",
        null,
        null,
        null,
        null);
    Restaurant localFood = new Restaurant(
        "test-local",
        "HOTPEPPER",
        "test-local",
        "出雲ご当地めし",
        "島根",
        "和食",
        1000,
        2200,
        0,
        0,
        "島根県出雲市",
        null,
        "郷土料理と地元料理",
        null,
        null);

    assertThat((Boolean) matchesRequestedGenre.invoke(provider, okonomiyaki, "粉もの")).isTrue();
    assertThat((Boolean) matchesRequestedGenre.invoke(provider, takoyaki, "たこ焼き")).isTrue();
    assertThat((Boolean) matchesRequestedGenre.invoke(provider, okonomiyaki, "お好み焼き")).isTrue();
    assertThat((Boolean) matchesRequestedGenre.invoke(provider, localFood, "郷土料理")).isTrue();
  }

  @Test
  void authenticatedUserGuardAllowsGuestAndRejectsMismatchedUserId() {
    AuthService authService = Mockito.mock(AuthService.class);
    var guard = new AuthenticatedUserService(authService);
    var authenticatedUser = new UserResponse(
        "user-1",
        "user@example.com",
        "User",
        "SUPABASE",
        Instant.parse("2026-06-10T00:00:00Z"),
        Instant.parse("2026-06-10T00:00:00Z"));
    Mockito.when(authService.me("Bearer token")).thenReturn(new AuthResponse(authenticatedUser, null));

    guard.requireSameUserOrGuest(null, "guest");
    guard.requireSameUser("Bearer token", "user-1");

    assertThatThrownBy(() -> guard.requireSameUser("Bearer token", "user-2"))
        .isInstanceOf(UnauthorizedException.class);
  }

  @Test
  void guestRandomDoesNotPersistUserHistory() {
    var selected = randomRestaurantService.choose(new RandomRestaurantRequest(ValidationService.GUEST_USER_ID, null, null, null, null, null, null, null, null));
    Long guestRows = jdbcClient.sql("SELECT COUNT(*) FROM random_histories WHERE user_id = 'guest'")
        .query(Long.class)
        .single();

    assertThat(selected.id()).isNotBlank();
    assertThat(guestRows).isZero();
    assertThatThrownBy(() -> randomHistoryService.findByUserId(ValidationService.GUEST_USER_ID))
        .isInstanceOf(UnauthorizedException.class);
  }

  @Test
  void guestCannotUsePersistedUserDataServices() {
    assertThatThrownBy(() -> favoriteService.create(new FavoriteCreateRequest(ValidationService.GUEST_USER_ID, "seed-umeda-ramen")))
        .isInstanceOf(UnauthorizedException.class);
    assertThatThrownBy(() -> visitCollectionService.findByUserId(ValidationService.GUEST_USER_ID))
        .isInstanceOf(UnauthorizedException.class);
    assertThatThrownBy(() -> statisticsService.calculate(ValidationService.GUEST_USER_ID))
        .isInstanceOf(UnauthorizedException.class);
  }

  @Test
  void validationRejectsAbusiveInputBeforeDatabaseErrors() {
    assertThatThrownBy(() -> restaurantQueryService.search("area\nx", null, null, null))
        .isInstanceOf(BadRequestException.class);
    assertThatThrownBy(() -> restaurantQueryService.search(null, null, -1, 1000))
        .isInstanceOf(BadRequestException.class);
    assertThatThrownBy(() -> restaurantQueryService.search(null, null, null, null, 91.0, 135.0, 3))
        .isInstanceOf(BadRequestException.class);
    assertThatThrownBy(() -> visitCollectionService.create(new VisitCreateRequest("user-rating", "seed-umeda-ramen", null, null, "ok", 6)))
        .isInstanceOf(BadRequestException.class);
  }

  @Test
  void coordinateSearchRetriesPrimaryProviderWithoutDistanceWhenNearbyIsEmpty() {
    var provider = new CoordinateFallbackProvider();
    var service = new RestaurantQueryService(
        restaurantRepository,
        List.of(provider),
        mapper,
        validationService);

    var restaurants = service.search("joetsu", "ramen", 0, 1500, 37.1479, 138.236, 4);

    assertThat(provider.coordinateSearchCalls).isEqualTo(1);
    assertThat(provider.keywordSearchCalls).isEqualTo(1);
    assertThat(restaurants).extracting("id").containsExactly("keyword-joetsu-ramen");
  }

  @Test
  void nearbyPlacesDoesNotCacheTemporaryGooglePhotoReferences() {
    var provider = new CountingNearbyPlacesProvider();
    var service = new NearbyPlacesService(provider, validationService, 600, 300, false, false, 20);
    var request = new NearbyPlacesRequest(35.681236, 139.767125, 1500, "ラーメン", null, false);

    var first = service.search(request, true);
    var second = service.search(new NearbyPlacesRequest(35.681336, 139.767225, 1500, "ラーメン", null, false), true);

    assertThat(first.cacheHit()).isFalse();
    assertThat(second.cacheHit()).isFalse();
    assertThat(provider.nearbyCallCount).isEqualTo(2);
    assertThat(second.places()).extracting("id").containsExactly("nearby-test-1");
  }

  @Test
  void nearbyPlacesConditionChangeRefreshesCandidates() {
    var provider = new CountingNearbyPlacesProvider();
    var service = new NearbyPlacesService(provider, validationService, 600, 300, false, false, 20);

    service.search(new NearbyPlacesRequest(35.681236, 139.767125, 1500, "ラーメン", null, false), true);
    service.search(new NearbyPlacesRequest(35.681236, 139.767125, 1500, "カフェ", null, false), true);

    assertThat(provider.nearbyCallCount).isEqualTo(2);
  }

  @Test
  void nearbyPlacesUsesGoogleForFreeUsersAndSeparatesPremiumCache() {
    var googleProvider = new CountingNearbyPlacesProvider();
    var service = new NearbyPlacesService(googleProvider, validationService, 600, 300, false, false, 20);
    var request = new NearbyPlacesRequest(35.681236, 139.767125, 1500, "ラーメン", null, true);

    var freeResponse = service.search(request, false);

    assertThat(freeResponse.places()).extracting("id").containsExactly("nearby-test-1");
    assertThat(freeResponse.cacheHit()).isFalse();
    assertThat(googleProvider.nearbyCallCount).isEqualTo(1);

    var premiumResponse = service.search(request, true);

    assertThat(premiumResponse.cacheHit()).isFalse();
    assertThat(googleProvider.nearbyCallCount).isEqualTo(2);
    assertThat(premiumResponse.places()).extracting("id").containsExactly("nearby-test-1");
  }

  @Test
  void nearbyPlacesRejectsInvalidInputBeforeProviderCall() {
    var provider = new CountingNearbyPlacesProvider();
    var service = new NearbyPlacesService(provider, validationService, 600, 300, false, false, 20);

    validationService.validateNearbyPlacesRequest(35.681236, 139.767125, 100, "ラーメン", null);
    validationService.validateNearbyPlacesRequest(35.681236, 139.767125, 10_000, "ラーメン", null);
    assertThatThrownBy(() -> service.search(new NearbyPlacesRequest(91.0, 139.767125, 1500, "ラーメン", null, false)))
        .isInstanceOf(BadRequestException.class);
    assertThatThrownBy(() -> service.search(new NearbyPlacesRequest(35.681236, 139.767125, 50, "ラーメン", null, false)))
        .isInstanceOf(BadRequestException.class);
    assertThatThrownBy(() -> service.search(new NearbyPlacesRequest(35.681236, 139.767125, 10_001, "ラーメン", null, false)))
        .isInstanceOf(BadRequestException.class);
    assertThat(provider.nearbyCallCount).isZero();
  }

  @Test
  void nearbyPlacesFallsBackToRestaurantProvidersWhenGoogleIsUnavailable() {
    var restaurantProvider = new NearbyRestaurantProvider();
    var restaurantService = new RestaurantQueryService(
        restaurantRepository,
        List.of(restaurantProvider),
        mapper,
        validationService);
    var service = new NearbyPlacesService(
        new UnavailableNearbyPlacesProvider(),
        restaurantService,
        validationService,
        600,
        300,
        false,
        false,
        20);

    var response = service.search(new NearbyPlacesRequest(34.699826, 135.49311, 500, "ramen", "1500", false));

    assertThat(response.source()).isEqualTo("RANDISH_RESTAURANTS");
    assertThat(response.cacheHit()).isFalse();
    assertThat(restaurantProvider.searchCallCount).isEqualTo(1);
    assertThat(response.places()).hasSize(1);
    assertThat(response.places().get(0).id()).isEqualTo("geoapify-geo-test-1");
    assertThat(response.places().get(0).provider()).isEqualTo("GEOAPIFY");
    assertThat(response.places().get(0).providerPlaceId()).isEqualTo("geo-test-1");
    assertThat(response.places().get(0).photoUrl()).isEqualTo("https://example.com/geo-test-1.jpg");
    assertThat(response.places().get(0).distanceMeters()).isLessThanOrEqualTo(500);
    assertThat(response.places().get(0).openNow()).isNull();
  }

  @Test
  void nearbyPlacesUsesGoogleFallbackWhenRestaurantProvidersReturnFewCandidates() {
    var googleProvider = new CountingNearbyPlacesProvider();
    var restaurantProvider = new NearbyRestaurantProvider();
    var restaurantService = new RestaurantQueryService(
        restaurantRepository,
        List.of(restaurantProvider),
        mapper,
        validationService);
    var service = new NearbyPlacesService(
        googleProvider,
        restaurantService,
        validationService,
        600,
        300,
        false,
        false,
        20);

    var response = service.search(new NearbyPlacesRequest(34.699826, 135.49311, 500, "ramen", "1500", false), true);

    assertThat(response.source()).isEqualTo("HYBRID_PLACES");
    assertThat(restaurantProvider.searchCallCount).isEqualTo(1);
    assertThat(googleProvider.nearbyCallCount).isEqualTo(1);
    assertThat(googleProvider.lastMaxCandidates).isEqualTo(20);
    assertThat(response.places()).extracting("id").containsExactly("nearby-test-1");
  }

  @Test
  void nearbyPlacesStillUsesGoogleForPhotosWhenRestaurantProvidersReturnEnoughCandidates() {
    var googleProvider = new CountingNearbyPlacesProvider();
    var restaurantProvider = new BulkNearbyRestaurantProvider(10);
    var restaurantService = new RestaurantQueryService(
        restaurantRepository,
        List.of(restaurantProvider),
        mapper,
        validationService);
    var service = new NearbyPlacesService(
        googleProvider,
        restaurantService,
        validationService,
        600,
        300,
        false,
        false,
        20);

    var response = service.search(new NearbyPlacesRequest(34.699826, 135.49311, 500, "ramen", "1500", false));

    assertThat(response.source()).isEqualTo("HYBRID_PLACES");
    assertThat(restaurantProvider.searchCallCount).isEqualTo(1);
    assertThat(googleProvider.nearbyCallCount).isEqualTo(1);
    assertThat(response.places()).hasSize(11);
  }

  @Test
  void nearbyPlacesCopiesGooglePhotoAndAttributionToMatchingNonHotPepperCandidate() {
    var googleProvider = new MatchingNearbyPlacesProvider();
    var restaurantProvider = new BulkNearbyRestaurantProvider(1);
    var restaurantService = new RestaurantQueryService(
        restaurantRepository,
        List.of(restaurantProvider),
        mapper,
        validationService);
    var service = new NearbyPlacesService(
        googleProvider,
        restaurantService,
        validationService,
        600,
        300,
        false,
        false,
        20);

    var response = service.search(new NearbyPlacesRequest(34.699826, 135.49311, 500, "ramen", "1500", false));

    assertThat(response.places()).hasSize(1);
    assertThat(response.places().getFirst().provider()).isEqualTo("GEOAPIFY");
    assertThat(response.places().getFirst().photoUrl()).isEqualTo("/api/google-places/photos?name=test-photo");
    assertThat(response.places().getFirst().photoAttributions())
        .extracting(PhotoAttributionResponse::displayName)
        .containsExactly("Photo Author");
  }

  @Test
  void nearbyPlacesUsesGoogleFallbackOnlyWhenRestaurantProvidersReturnNoCandidates() {
    var googleProvider = new CountingNearbyPlacesProvider();
    var restaurantService = new RestaurantQueryService(
        restaurantRepository,
        List.of(),
        mapper,
        validationService);
    var service = new NearbyPlacesService(
        googleProvider,
        restaurantService,
        validationService,
        600,
        300,
        false,
        false,
        20);

    var response = service.search(new NearbyPlacesRequest(34.699826, 135.49311, 500, "ramen", "1500", false), true);

    assertThat(response.source()).isEqualTo("GOOGLE_PLACES");
    assertThat(googleProvider.nearbyCallCount).isEqualTo(1);
    assertThat(response.places()).extracting("id").containsExactly("nearby-test-1");
  }

  @Test
  void nearbyPlacesAppliesMinimumRatingOnlyForPremiumUsers() {
    var googleProvider = new CountingNearbyPlacesProvider();
    var restaurantService = new RestaurantQueryService(
        restaurantRepository,
        List.of(),
        mapper,
        validationService);
    var service = new NearbyPlacesService(
        googleProvider,
        restaurantService,
        validationService,
        600,
        300,
        false,
        false,
        20);
    var request = new NearbyPlacesRequest(34.699826, 135.49311, 500, "ramen", "1500", false, 4.5);

    assertThat(service.search(request, true).places()).isEmpty();
    assertThat(service.search(request, false).places()).extracting("id").containsExactly("nearby-test-1");
  }

  @Test
  void nearbyPlacesReturnsEmptyListWhenGoogleAndRestaurantProvidersHaveNoCandidates() {
    var restaurantService = new RestaurantQueryService(
        restaurantRepository,
        List.of(),
        mapper,
        validationService);
    var service = new NearbyPlacesService(
        new UnavailableNearbyPlacesProvider(),
        restaurantService,
        validationService,
        600,
        300,
        false,
        false,
        20);

    var response = service.search(new NearbyPlacesRequest(34.699826, 135.49311, 500, "ramen", "1500", false));

    assertThat(response.source()).isEqualTo("RANDISH_RESTAURANTS");
    assertThat(response.places()).isEmpty();
    assertThat(response.message()).isEqualTo("no nearby candidates");
  }

  private static class CoordinateFallbackProvider implements ExternalRestaurantProvider {
    private int coordinateSearchCalls;
    private int keywordSearchCalls;

    @Override
    public boolean isAvailable() {
      return true;
    }

    @Override
    public List<Restaurant> search(String area, String genre, Integer budgetMin, Integer budgetMax, Double latitude, Double longitude, Integer range) {
      if (latitude != null && longitude != null) {
        coordinateSearchCalls++;
        return List.of();
      }
      keywordSearchCalls++;
      return List.of(new Restaurant(
          "keyword-joetsu-ramen",
          "HOTPEPPER",
          "keyword-joetsu-ramen",
          "Joetsu Ramen",
          area,
          genre,
          1001,
          1500,
          0,
          0,
          "Niigata Joetsu",
          null,
          "test",
          null,
          null));
    }
  }

  private static class CountingNearbyPlacesProvider extends GooglePlacesEnrichmentService {
    private int nearbyCallCount;
    private int lastMaxCandidates;

    private CountingNearbyPlacesProvider() {
      super(RestClient.builder());
    }

    @Override
    public boolean isAvailable() {
      return true;
    }

    @Override
    public List<CandidatePlaceResponse> searchNearbyCandidates(NearbyPlacesRequest request, int maxCandidates) {
      nearbyCallCount++;
      lastMaxCandidates = maxCandidates;
      return List.of(new CandidatePlaceResponse(
          "nearby-test-1",
          "GOOGLE_PLACES",
          "nearby-test-1",
          "Nearby Test",
          request.latitude(),
          request.longitude(),
          List.of(request.category() == null ? "飲食店" : request.category()),
          4.3,
          2,
          true,
          "東京都千代田区丸の内",
          0,
          "https://www.google.com/maps/search/?api=1&query=Nearby%20Test",
          "https://example.com/google-nearby-test-1.jpg",
          List.of()));
    }
  }

  private static class CountingEnrichmentService extends GooglePlacesEnrichmentService {
    private int enrichCallCount;

    private CountingEnrichmentService() {
      super(RestClient.builder());
    }

    @Override
    public RestaurantResponse enrich(RestaurantResponse restaurant) {
      enrichCallCount++;
      return restaurant;
    }
  }

  private static class MatchingNearbyPlacesProvider extends GooglePlacesEnrichmentService {
    private MatchingNearbyPlacesProvider() {
      super(RestClient.builder());
    }

    @Override
    public boolean isAvailable() {
      return true;
    }

    @Override
    public List<CandidatePlaceResponse> searchNearbyCandidates(NearbyPlacesRequest request, int maxCandidates) {
      return List.of(new CandidatePlaceResponse(
          "google-match-1",
          "GOOGLE_PLACES",
          "google-match-1",
          "HAL Ramen 0",
          request.latitude(),
          request.longitude(),
          List.of("ramen"),
          4.5,
          2,
          true,
          "Osaka Kita 0",
          0,
          "https://maps.google.com/?cid=1",
          "/api/google-places/photos?name=test-photo",
          List.of(new PhotoAttributionResponse("Photo Author", "https://maps.google.com/contrib/1"))));
    }
  }

  private static class UnavailableNearbyPlacesProvider extends GooglePlacesEnrichmentService {
    private UnavailableNearbyPlacesProvider() {
      super(RestClient.builder());
    }

    @Override
    public boolean isAvailable() {
      return false;
    }

    @Override
    public List<CandidatePlaceResponse> searchNearbyCandidates(NearbyPlacesRequest request, int maxCandidates) {
      throw new AssertionError("Google Places should not be called when unavailable.");
    }
  }

  private static class NearbyRestaurantProvider implements ExternalRestaurantProvider {
    private int searchCallCount;

    @Override
    public boolean isAvailable() {
      return true;
    }

    @Override
    public List<Restaurant> search(String area, String genre, Integer budgetMin, Integer budgetMax, Double latitude, Double longitude, Integer range) {
      searchCallCount++;
      return List.of(new Restaurant(
          "geo-test-1",
          "GEOAPIFY",
          "geo-test-1",
          "HAL Ramen",
          area,
          genre == null ? "ramen" : genre,
          900,
          1500,
          4.1,
          4,
          "Osaka Kita",
          "https://example.com/geo-test-1.jpg",
          "test",
          latitude == null ? 34.699826 : latitude + 0.0002,
          longitude == null ? 135.49311 : longitude + 0.0002));
    }
  }

  private static class BulkNearbyRestaurantProvider implements ExternalRestaurantProvider {
    private final int count;
    private int searchCallCount;

    private BulkNearbyRestaurantProvider(int count) {
      this.count = count;
    }

    @Override
    public boolean isAvailable() {
      return true;
    }

    @Override
    public List<Restaurant> search(String area, String genre, Integer budgetMin, Integer budgetMax, Double latitude, Double longitude, Integer range) {
      searchCallCount++;
      List<Restaurant> restaurants = new ArrayList<>();
      for (int index = 0; index < count; index++) {
        restaurants.add(new Restaurant(
            "geo-test-" + index,
            "GEOAPIFY",
            "geo-test-" + index,
            "HAL Ramen " + index,
            area,
            genre == null ? "ramen" : genre,
            900,
            1500,
            4.1,
            4,
            "Osaka Kita " + index,
            null,
            "test",
            latitude == null ? 34.699826 : latitude + (0.00002 * index),
            longitude == null ? 135.49311 : longitude + (0.00002 * index)));
      }
      return restaurants;
    }
  }

  private static String sha256Base64Url(String value) throws Exception {
    MessageDigest digest = MessageDigest.getInstance("SHA-256");
    byte[] bytes = digest.digest(value.getBytes(StandardCharsets.UTF_8));
    return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
  }

  private static class FixedProvider implements ExternalRestaurantProvider {
    private final String idPrefix;
    private final boolean fallback;
    private final int availableCount;
    private int lastRandomMaxCandidates;
    private int randomCallCount;

    private FixedProvider(String idPrefix, boolean fallback, int availableCount) {
      this.idPrefix = idPrefix;
      this.fallback = fallback;
      this.availableCount = availableCount;
    }

    @Override
    public boolean isAvailable() {
      return true;
    }

    @Override
    public boolean isFallback() {
      return fallback;
    }

    @Override
    public List<Restaurant> search(String area, String genre, Integer budgetMin, Integer budgetMax, Double latitude, Double longitude, Integer range) {
      return restaurants(Math.min(availableCount, 100), area, genre);
    }

    @Override
    public List<Restaurant> searchRandomCandidates(
        String area,
        String genre,
        Integer budgetMin,
        Integer budgetMax,
        Double latitude,
        Double longitude,
        Integer range,
        int maxCandidates) {
      randomCallCount++;
      lastRandomMaxCandidates = maxCandidates;
      return restaurants(Math.min(availableCount, maxCandidates), area, genre);
    }

    private List<Restaurant> restaurants(int count, String area, String genre) {
      String provider = fallback ? "GOOGLE_PLACES" : "HOTPEPPER";
      return java.util.stream.IntStream.range(0, count)
          .mapToObj(index -> new Restaurant(
              "%s-%03d".formatted(idPrefix, index),
              provider,
              "%s-%03d".formatted(idPrefix, index),
              "%s 店 %03d".formatted(idPrefix, index),
              area,
              genre,
              800,
              1500,
              4.0,
              5,
              "大阪府大阪市東成区%sテスト%03d".formatted(idPrefix, index),
              null,
              "test",
              null,
              null))
          .toList();
    }
  }

  private static class OrderedProvider implements ExternalRestaurantProvider {
    private final String providerKey;
    private final boolean fallback;
    private final List<String> callOrder;

    private OrderedProvider(String providerKey, boolean fallback, List<String> callOrder) {
      this.providerKey = providerKey;
      this.fallback = fallback;
      this.callOrder = callOrder;
    }

    @Override
    public String providerKey() {
      return providerKey;
    }

    @Override
    public boolean isAvailable() {
      return true;
    }

    @Override
    public boolean isFallback() {
      return fallback;
    }

    @Override
    public List<Restaurant> search(String area, String genre, Integer budgetMin, Integer budgetMax, Double latitude, Double longitude, Integer range) {
      return searchRandomCandidates(area, genre, budgetMin, budgetMax, latitude, longitude, range, 1);
    }

    @Override
    public List<Restaurant> searchRandomCandidates(
        String area,
        String genre,
        Integer budgetMin,
        Integer budgetMax,
        Double latitude,
        Double longitude,
        Integer range,
        int maxCandidates) {
      callOrder.add(providerKey);
      return List.of(new Restaurant(
          providerKey.toLowerCase(Locale.ROOT) + "-order-test",
          providerKey,
          providerKey.toLowerCase(Locale.ROOT) + "-external",
          providerKey + " order test",
          area,
          genre,
          800,
          1500,
          4.0,
          5,
          "島根県出雲市 " + providerKey,
          null,
          "test",
          latitude,
          longitude));
    }
  }

  private static class NamedProvider implements ExternalRestaurantProvider {
    private final List<Restaurant> restaurants;
    private int randomCallCount;

    private NamedProvider(List<Restaurant> restaurants) {
      this.restaurants = restaurants;
    }

    @Override
    public boolean isAvailable() {
      return true;
    }

    @Override
    public List<Restaurant> search(String area, String genre, Integer budgetMin, Integer budgetMax, Double latitude, Double longitude, Integer range) {
      return restaurants;
    }

    @Override
    public List<Restaurant> searchRandomCandidates(
        String area,
        String genre,
        Integer budgetMin,
        Integer budgetMax,
        Double latitude,
        Double longitude,
        Integer range,
        int maxCandidates) {
      randomCallCount++;
      return restaurants.stream().limit(maxCandidates).toList();
    }
  }
}
