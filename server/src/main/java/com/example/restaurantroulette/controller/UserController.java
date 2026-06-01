package com.example.restaurantroulette.controller;

import com.example.restaurantroulette.dto.ApiDtos.AuthResponse;
import com.example.restaurantroulette.dto.ApiDtos.UserResponse;
import com.example.restaurantroulette.service.AuthService;
import com.example.restaurantroulette.service.UserService;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RestController;

@CrossOrigin
@RestController
@RequestMapping("/api/users")
public class UserController {
  private final UserService userService;
  private final AuthService authService;

  public UserController(UserService userService, AuthService authService) {
    this.userService = userService;
    this.authService = authService;
  }

  @GetMapping("/me")
  public AuthResponse me(@RequestHeader("Authorization") String authorizationHeader) {
    return authService.me(authorizationHeader);
  }

  @GetMapping("/{id}")
  public UserResponse findById(@PathVariable String id) {
    return userService.findById(id);
  }
}
