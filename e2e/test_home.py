import re

from playwright.sync_api import expect


def test_home_page_loads(page):
    expect(page.locator(".home-title")).to_have_text("Квокка")
    expect(page.locator(".home-subtitle")).to_be_visible()


def test_player_name_prefilled(page):
    name_input = page.locator(".player-identity-input input")
    value = name_input.input_value()
    assert len(value) > 0, "Player name should be auto-generated"


def test_create_room_button_visible(page):
    btn = page.locator("button", has_text="Создать комнату")
    expect(btn).to_be_visible()


def test_join_mode_toggle(page):
    # Initially in menu mode
    expect(page.locator("button", has_text="Присоединиться")).to_be_visible()
    expect(page.locator(".input-code")).not_to_be_visible()

    # Switch to join mode
    page.locator("button", has_text="Присоединиться").click()
    expect(page.locator(".input-code")).to_be_visible()
    expect(page.locator("button", has_text="Войти")).to_be_visible()

    # Switch back
    page.locator("button", has_text="Назад").click()
    expect(page.locator(".input-code")).not_to_be_visible()
    expect(page.locator("button", has_text="Создать комнату")).to_be_visible()


def test_game_selector_visible(page):
    games = page.locator(".game-logo")
    assert games.count() >= 3, "Should have at least 3 game options"


def test_game_selector_has_active(page):
    selected = page.locator(".game-logo--selected")
    expect(selected).to_be_visible()
