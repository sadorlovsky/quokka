"""
Open N browsers, create a Tapeworm game with N players, and take screenshots.

Usage:
    python scripts/preview-tapeworm.py [--players 3] [--port PORT]

Requires: pip install playwright && playwright install
Uses the running dev server (default localhost:3000).
"""

import argparse
import time

from playwright.sync_api import expect, sync_playwright

NAMES = ["Лихой Енот", "Модный Олень", "Чудной Хомяк", "Тихий Попугай"]


def wait_for_home(page):
    page.wait_for_selector(".home-title", timeout=10000)


def select_tapeworm(page):
    """Click the Tapeworm game logo on the home screen."""
    logos = page.locator(".game-selector-item")
    count = logos.count()
    for i in range(count):
        item = logos.nth(i)
        if "Червь" in (item.text_content() or ""):
            item.locator("button").click()
            return
    raise RuntimeError("Tapeworm game not found in selector")


def set_name(page, name):
    """Set the player name in the home screen input."""
    inp = page.locator(".player-identity-input .input")
    inp.fill(name)


def create_room(page, name):
    """Create a room and return the room code."""
    set_name(page, name)
    select_tapeworm(page)
    btn = page.locator("button", has_text="Создать комнату")
    expect(btn).to_be_enabled(timeout=10000)
    btn.click()
    page.wait_for_selector(".room-code-value", timeout=10000)
    code = page.locator(".room-code-value").text_content()
    return code


def join_room(page, name, code):
    """Join a room by code."""
    set_name(page, name)
    btn = page.locator("button", has_text="Присоединиться")
    expect(btn).to_be_enabled(timeout=10000)
    btn.click()
    page.locator(".input-code").fill(code)
    page.locator("button", has_text="Войти").click()
    page.wait_for_selector(".room-code-value", timeout=10000)


def main():
    parser = argparse.ArgumentParser(description="Preview Tapeworm with N players")
    parser.add_argument(
        "--players",
        type=int,
        default=4,
        choices=[2, 3, 4],
        help="Number of players (2-4)",
    )
    parser.add_argument("--port", type=int, default=3000, help="Dev server port")
    args = parser.parse_args()
    num_players = args.players
    base_url = f"http://localhost:{args.port}"
    names = NAMES[:num_players]

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)

        # Create separate contexts (separate sessions)
        pages = []
        for i in range(num_players):
            ctx = browser.new_context(
                viewport={"width": 430, "height": 932},  # iPhone 14 Pro Max
            )
            page = ctx.new_page()
            page.goto(base_url)
            wait_for_home(page)
            pages.append(page)

        # Player 1 creates the room
        code = create_room(pages[0], names[0])
        print(f"Room created: {code}")

        # Other players join
        for i in range(1, num_players):
            join_room(pages[i], names[i], code)
            print(f"{names[i]} joined")

        time.sleep(0.5)

        # Host starts the game
        start_btn = pages[0].locator("button", has_text="Начать игру")
        expect(start_btn).to_be_enabled(timeout=5000)
        start_btn.click()

        # Wait for game to load on all pages
        for page in pages:
            page.wait_for_selector(".tapeworm-table", timeout=10000)

        time.sleep(1)  # let animations settle

        # Take screenshots
        for i, page in enumerate(pages):
            path = f"screenshots/tapeworm-{num_players}p-player{i + 1}.png"
            page.screenshot(path=path, full_page=False)
            print(f"Screenshot saved: {path}")

        browser.close()
        print("Done!")


if __name__ == "__main__":
    main()
