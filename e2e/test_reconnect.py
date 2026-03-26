import re

from conftest import create_room
from playwright.sync_api import expect


def test_session_token_saved(page):
    create_room(page)
    token = page.evaluate("() => localStorage.getItem('sessionToken')")
    assert token is not None and len(token) > 0


def test_reconnect_restores_room(page):
    code = create_room(page)
    url_before = page.url

    # Reload the page — should reconnect via sessionToken
    page.reload()
    page.wait_for_selector(".room-code-value")

    expect(page.locator(".room-code-value")).to_have_text(code)
    expect(page).to_have_url(re.compile(rf"/room/{code}$"))


def test_reconnect_preserves_session_token(page):
    create_room(page)
    token_before = page.evaluate("() => localStorage.getItem('sessionToken')")

    page.reload()
    page.wait_for_selector(".room-code-value")

    token_after = page.evaluate("() => localStorage.getItem('sessionToken')")
    assert token_before == token_after


def test_cleared_session_goes_home(page):
    create_room(page)

    page.evaluate("() => localStorage.clear()")
    page.goto("/")
    page.wait_for_selector(".home-title")

    expect(page.locator(".home-title")).to_have_text("Квокка")
