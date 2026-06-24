"""
One Max VPN — Telegram Bot
Стек: Python 3.10+, aiogram 3.x
"""

import asyncio
import logging
from datetime import datetime

from aiogram import Bot, Dispatcher, types
from aiogram.filters import Command
from aiogram.types import Message, InlineKeyboardMarkup, InlineKeyboardButton

from config import BOT_TOKEN
from servers import ServerManager

# ─── Логирование ──────────────────────────────────────────────────────────────

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(name)s: %(message)s'
)
log = logging.getLogger('OneMaxVPN')

# ─── Инициализация ────────────────────────────────────────────────────────────

bot = Bot(token=BOT_TOKEN)
dp  = Dispatcher()
mgr = ServerManager()

# ─── Хэндлеры команд ──────────────────────────────────────────────────────────

@dp.message(Command('start'))
async def cmd_start(msg: Message):
    text = (
        "🛡️ <b>One Max VPN Bot</b>\n\n"
        "Привет! Я помогаю получить актуальные данные VPN-серверов.\n\n"
        "📋 <b>Команды:</b>\n"
        "/server — текущий активный сервер\n"
        "/list   — все доступные серверы\n"
        "/status — статус системы\n"
        "/help   — справка\n\n"
        "🔄 Серверы обновляются автоматически каждые 24 часа."
    )
    kb = InlineKeyboardMarkup(inline_keyboard=[[
        InlineKeyboardButton(text="🌐 Сайт", url="https://one-max-vpn.vercel.app"),
        InlineKeyboardButton(text="📦 Скачать расширение", url="https://github.com/OinkTechLtd/one-max-vpn/releases/latest")
    ]])
    await msg.answer(text, parse_mode='HTML', reply_markup=kb)
    log.info(f'/start от {msg.from_user.id} ({msg.from_user.username})')


@dp.message(Command('server'))
async def cmd_server(msg: Message):
    server = mgr.get_current()
    if not server:
        await msg.answer("❌ Нет активного сервера. Попробуйте /status")
        return

    text = (
        f"🖥️ <b>Текущий сервер</b>\n\n"
        f"🌐 <b>Хост:</b> <code>{server['host']}</code>\n"
        f"🔌 <b>Порт:</b> <code>{server['port']}</code>\n"
        f"👤 <b>Логин:</b> <code>{server.get('username', '—')}</code>\n"
        f"🔑 <b>Пароль:</b> <code>{server.get('password', '—')}</code>\n"
        f"📡 <b>Протокол:</b> {server.get('protocol', 'HTTP Proxy')}\n\n"
        f"⏰ Обновлён: {server.get('updated_at', 'неизвестно')}"
    )
    await msg.answer(text, parse_mode='HTML')
    log.info(f'/server от {msg.from_user.id}')


@dp.message(Command('list'))
async def cmd_list(msg: Message):
    servers = mgr.get_all()
    if not servers:
        await msg.answer("❌ Список серверов пуст")
        return

    lines = [f"📋 <b>Доступные серверы ({len(servers)}):</b>\n"]
    for i, s in enumerate(servers, 1):
        mark = "✅" if s == mgr.get_current() else "⚪"
        lines.append(f"{mark} {i}. <code>{s['host']}:{s['port']}</code>")

    await msg.answer('\n'.join(lines), parse_mode='HTML')


@dp.message(Command('status'))
async def cmd_status(msg: Message):
    servers  = mgr.get_all()
    current  = mgr.get_current()
    last_upd = mgr.last_updated()

    status_icon = "🟢" if current else "🔴"
    text = (
        f"{status_icon} <b>Статус One Max VPN</b>\n\n"
        f"🖥️ Серверов в пуле: <b>{len(servers)}</b>\n"
        f"✅ Активный сервер: <b>{'Да' if current else 'Нет'}</b>\n"
        f"🕐 Последнее обновление: <b>{last_upd}</b>\n"
        f"📅 Следующее обновление: <b>00:00 UTC</b>\n\n"
        f"🤖 Бот работает: ✅"
    )
    await msg.answer(text, parse_mode='HTML')


@dp.message(Command('help'))
async def cmd_help(msg: Message):
    text = (
        "❓ <b>Справка One Max VPN</b>\n\n"
        "<b>Что это?</b>\n"
        "One Max VPN — бесплатный VPN-сервис на основе публичных прокси-серверов. "
        "Подходит для базовой анонимности и обхода блокировок.\n\n"
        "<b>Как использовать прокси в браузере:</b>\n"
        "1. Установи расширение One Max VPN\n"
        "2. Нажми кнопку включения в попапе\n"
        "3. Готово — весь трафик идёт через сервер\n\n"
        "<b>Вручную (если нет расширения):</b>\n"
        "Настройки браузера → Прокси → HTTP-прокси\n"
        "Введи данные из команды /server\n\n"
        "<b>Команды:</b>\n"
        "/server — данные текущего сервера\n"
        "/list   — все серверы\n"
        "/status — статус системы\n"
    )
    await msg.answer(text, parse_mode='HTML')


# ─── Запуск ───────────────────────────────────────────────────────────────────

async def main():
    log.info("🛡️ One Max VPN Bot запускается...")

    # Запускаем планировщик обновления серверов
    asyncio.create_task(mgr.schedule_updates())

    await dp.start_polling(bot)


if __name__ == '__main__':
    asyncio.run(main())
