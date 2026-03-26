from conftest import create_room, join_room
from playwright.sync_api import expect


def start_two_player_game(page, second_page):
    code = create_room(page)

    second_page.goto("/")
    second_page.wait_for_selector(".home-title")
    join_room(second_page, code)

    page.locator("button", has_text="Начать игру").click()
    page.wait_for_selector(".game-header")
    second_page.wait_for_selector(".game-header")

    return code


def test_player_can_leave_active_game(page, second_page):
    code = start_two_player_game(page, second_page)

    second_page.locator(".game-header button", has_text="Выйти").click()

    page.wait_for_selector(".lobby-header")
    second_page.wait_for_selector(".home-title")

    expect(page.locator(".room-code-value")).to_have_text(code)
    expect(page.locator(".player-list-item")).to_have_count(1)
    expect(second_page.locator(".home-title")).to_have_text("Квокка")


def test_host_can_end_active_game(page, second_page):
    start_two_player_game(page, second_page)

    page.locator(".game-header button", has_text="Закончить игру").click()

    page.wait_for_selector(".lobby-header")
    second_page.wait_for_selector(".lobby-header")

    expect(page.locator(".player-list-item")).to_have_count(2)
    expect(second_page.locator(".player-list-item")).to_have_count(2)
