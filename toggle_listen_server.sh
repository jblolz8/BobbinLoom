#!/usr/bin/env bash
# BobbinLoom — Toggle or configure network listen mode (.env HOST & PORT)

cd "$(dirname "$0")" || exit 1

echo "============================================"
echo "  BobbinLoom Listen Server Configuration"
echo "============================================"
echo

configure_env() {
    read -r -p "Enter HOST [default: 0.0.0.0]: " INPUT_HOST
    INPUT_HOST=${INPUT_HOST:-0.0.0.0}

    read -r -p "Enter PORT [default: 8787]: " INPUT_PORT
    INPUT_PORT=${INPUT_PORT:-8787}

    cat > .env <<EOF
HOST=${INPUT_HOST}
PORT=${INPUT_PORT}
EOF

    echo
    echo "[ON] Saved .env with:"
    echo "  HOST=${INPUT_HOST}"
    echo "  PORT=${INPUT_PORT}"
    echo
    echo "Restart BobbinLoom (./start.sh) for changes to take effect."
    echo
}

if [ -f .env ]; then
    echo "Current status: ON (.env file found)"
    echo "--------------------------------------------"
    sed 's/^/  /' .env
    echo "--------------------------------------------"
    echo
    read -r -p "Press [Enter] to turn OFF (remove .env), or type [E] to edit HOST/PORT: " ACTION
    case "$ACTION" in
        [eE])
            echo
            configure_env
            ;;
        *)
            rm -f .env
            echo
            echo "[OFF] Removed .env. BobbinLoom will now bind to 127.0.0.1:8787 (localhost only)."
            echo
            ;;
    esac
else
    echo "Current status: OFF (Localhost only — 127.0.0.1:8787)"
    echo
    configure_env
fi
