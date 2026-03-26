import re

from conftest import create_room
from playwright.sync_api import expect


def test_join_via_url(page, second_page):
    code = create_room(page)

    # Second player navigates directly to room URL
    second_page.goto(f"/room/{code}")
    second_page.wait_for_selector(".room-code-value")

    expect(second_page.locator(".room-code-value")).to_have_text(code)
    expect(page.locator(".player-list-item")).to_have_count(2)


def test_invalid_room_code_stays_home(page):
    page.goto("/room/ZZZZ")

    # Should end up on home screen (invalid room)
    page.wait_for_selector(".home-title")
    expect(page.locator(".home-title")).to_have_text("Квокка")
