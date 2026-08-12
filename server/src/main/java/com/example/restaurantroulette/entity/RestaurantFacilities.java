package com.example.restaurantroulette.entity;

/**
 * 席や設備の情報。ホットペッパーの検索結果にもともと含まれているが、
 * これまで読み捨てていた項目をそのまま保持する。
 *
 * <p>「なぜこの店なのか」を説明するときに、評価や価格帯だけでは
 * どのジャンルにも当てはまる一般論にしかならない。個室の有無・座敷・
 * お子様連れ可といった、シチュエーションに直接効く事実がここに入る。
 *
 * <p>値はホットペッパーの表記をそのまま持つ（例: 個室は「あり」「なし」、
 * お子様連れは「お子様連れ歓迎」、23時以降は「営業している」）。
 * 判定はアプリ側ではなくここで済ませ、真偽が曖昧な「未確認」は false として扱う。
 */
public record RestaurantFacilities(
    Boolean privateRoom,
    Boolean tatami,
    Boolean horigotatsu,
    Boolean childFriendly,
    Boolean charter,
    Boolean freeDrink,
    Boolean freeFood,
    Boolean course,
    Boolean lunch,
    Boolean openLate,
    Boolean parking,
    Boolean barrierFree,
    Boolean nonSmoking,
    Boolean englishMenu,
    Integer capacity,
    Integer partyCapacity,
    String stationName,
    String openHours) {
}
