package com.example.restaurantroulette.controller;

import com.example.restaurantroulette.dto.ApiDtos.ContactRequest;
import com.example.restaurantroulette.dto.ApiDtos.ContactResponse;
import com.example.restaurantroulette.service.ContactService;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/contact")
public class ContactController {
  private final ContactService contactService;

  public ContactController(ContactService contactService) {
    this.contactService = contactService;
  }

  @PostMapping
  public ContactResponse send(@RequestBody ContactRequest request) {
    return contactService.send(request);
  }
}
