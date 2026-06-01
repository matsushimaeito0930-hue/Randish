package com.example.restaurantroulette;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.example.restaurantroulette.dto.ApiDtos.FavoriteCreateRequest;
import com.example.restaurantroulette.dto.ApiDtos.RandomRestaurantRequest;
import com.example.restaurantroulette.dto.ApiDtos.UserCreateRequest;
import com.example.restaurantroulette.dto.ApiDtos.VisitCreateRequest;
import com.example.restaurantroulette.exception.ConflictException;
import com.example.restaurantroulette.repository.AppUserRepository;
import com.example.restaurantroulette.repository.FavoriteRestaurantRepository;
import com.example.restaurantroulette.repository.RandomHistoryRepository;
import com.example.restaurantroulette.repository.RestaurantRepository;
import com.example.restaurantroulette.repository.StampRepository;
import com.example.restaurantroulette.repository.VisitCollectionRepository;
import com.example.restaurantroulette.service.DtoMapper;
import com.example.restaurantroulette.service.FavoriteService;
import com.example.restaurantroulette.service.RandomHistoryService;
import com.example.restaurantroulette.service.RandomRestaurantService;
import com.example.restaurantroulette.service.RestaurantQueryService;
import com.example.restaurantroulette.service.StampService;
import com.example.restaurantroulette.service.StatisticsService;
import com.example.restaurantroulette.service.UserService;
import com.example.restaurantroulette.service.ValidationService;
import com.example.restaurantroulette.service.VisitCollectionService;
import com.example.restaurantroulette.service.external.GooglePlacesEnrichmentService;
import java.util.List;
import org.junit.jupiter.api.Test;
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
  private final GooglePlacesEnrichmentService googlePlacesEnrichmentService = new GooglePlacesEnrichmentService(RestClient.builder());
  private final RestaurantQueryService restaurantQueryService = new RestaurantQueryService(
      restaurantRepository,
      List.of(),
      mapper,
      validationService,
      googlePlacesEnrichmentService);
  private final RandomHistoryService randomHistoryService = new RandomHistoryService(new RandomHistoryRepository(jdbcClient), restaurantQueryService, mapper, validationService);
  private final RandomRestaurantService randomRestaurantService = new RandomRestaurantService(
      restaurantQueryService,
      randomHistoryService,
      mapper,
      validationService,
      googlePlacesEnrichmentService);
  private final FavoriteService favoriteService = new FavoriteService(new FavoriteRestaurantRepository(jdbcClient), restaurantQueryService, mapper, validationService);
  private final UserService userService = new UserService(new AppUserRepository(jdbcClient), mapper);
  private final StampService stampService = new StampService(new StampRepository(jdbcClient), mapper, validationService);
  private final VisitCollectionService visitCollectionService = new VisitCollectionService(new VisitCollectionRepository(jdbcClient), restaurantQueryService, stampService, mapper, validationService);
  private final StatisticsService statisticsService = new StatisticsService(visitCollectionService, restaurantQueryService, favoriteService, validationService);

  @Test
  void searchCanFilterRestaurants() {
    var restaurants = restaurantQueryService.search("梅田", "ラーメン", 1000, 2000);

    assertThat(restaurants).isNotEmpty();
    assertThat(restaurants).allMatch(restaurant -> restaurant.area().equals("梅田"));
    assertThat(restaurants).allMatch(restaurant -> restaurant.genre().equals("ラーメン"));
  }

  @Test
  void randomSavesHistory() {
    var selected = randomRestaurantService.choose(new RandomRestaurantRequest("user-1", "梅田", null, null, null, null, null, null));
    var histories = randomHistoryService.findByUserId("user-1");

    assertThat(selected.id()).isNotBlank();
    assertThat(histories).hasSize(1);
    assertThat(histories.getFirst().restaurant().id()).isEqualTo(selected.id());
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
  void registerUserPreventsDuplicateEmail() {
    userService.register(new UserCreateRequest("duplicate@example.com", "password123", "First"));

    assertThatThrownBy(() -> userService.register(new UserCreateRequest("DUPLICATE@example.com", "password123", "Second")))
        .isInstanceOf(ConflictException.class);
  }

  @Test
  void favoritePreventsDuplicates() {
    favoriteService.create(new FavoriteCreateRequest("user-1", "seed-umeda-ramen"));

    assertThatThrownBy(() -> favoriteService.create(new FavoriteCreateRequest("user-1", "seed-umeda-ramen")))
        .isInstanceOf(ConflictException.class);
  }

  @Test
  void visitAwardsFirstVisitStampAndStatistics() {
    visitCollectionService.create(new VisitCreateRequest("user-visit", "seed-umeda-ramen", null, null, "good", 5));
    favoriteService.create(new FavoriteCreateRequest("user-visit", "seed-umeda-ramen"));

    var stamps = stampService.findByUserId("user-visit");
    var statistics = statisticsService.calculate("user-visit");

    assertThat(stamps).hasSize(1);
    assertThat(statistics.totalVisits()).isEqualTo(1);
    assertThat(statistics.visitedRestaurantCount()).isEqualTo(1);
    assertThat(statistics.favoriteGenre()).isEqualTo("ラーメン");
    assertThat(statistics.favoriteCount()).isEqualTo(1);
  }

  @Test
  void repeatedVisitsAreTrackedWithoutDuplicatingFirstVisitStamp() {
    visitCollectionService.create(new VisitCreateRequest("user-repeat", "seed-umeda-ramen", null, null, "first", 5));
    visitCollectionService.create(new VisitCreateRequest("user-repeat", "seed-umeda-ramen", null, null, "again", 4));

    var visits = visitCollectionService.findByUserId("user-repeat");
    var stamps = stampService.findByUserId("user-repeat");
    var statistics = statisticsService.calculate("user-repeat");

    assertThat(visits).hasSize(2);
    assertThat(stamps).hasSize(1);
    assertThat(statistics.totalVisits()).isEqualTo(2);
    assertThat(statistics.visitedRestaurantCount()).isEqualTo(1);
  }

  @Test
  void restaurantResyncKeepsDependentUserData() {
    favoriteService.create(new FavoriteCreateRequest("user-resync", "seed-umeda-ramen"));

    new RestaurantRepository(jdbcClient);

    assertThat(favoriteService.findByUserId("user-resync")).hasSize(1);
  }
}
