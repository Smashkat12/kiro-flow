#!/usr/bin/env bash
#
# kiro-flow installer — ruflo (claude-flow) for AWS Kiro
# Mirrors ruflo's scripts/install.sh flag-for-flag (MIT, ruvnet/ruflo), with
# one deliberate difference: where ruflo auto-installs the Claude Code CLI,
# this checks for kiro-cli and tells you where to get it — we never install
# an IDE/CLI behind your back on a governed work machine.
#
# Usage:
#   curl -fsSL https://cdn.jsdelivr.net/gh/smashkat12/kiro-flow@main/scripts/install.sh | bash
#   curl -fsSL .../install.sh | bash -s -- --full
#
# Options (via arguments):
#   --global, -g          Global install (npm install -g ruflo)
#   --minimal, -m         Minimal install (no optional deps)
#   --doctor, -d          Run kiro-flow doctor after install
#   --init, -i            Initialize current directory (default: on)
#   --no-init             Skip project initialization
#   --full, -f            Full setup (global + doctor + init)
#   --version=X.X.X       Specific ruflo version (default: ~3.23.0)
#   --help, -h            Show help
#
# Options (via environment):
#   export RUFLO_VERSION=3.23.0      # ruflo version to install
#   export KIRO_FLOW_MINIMAL=1
#   export KIRO_FLOW_GLOBAL=1
#   export KIRO_FLOW_REPO=https://github.com/smashkat12/kiro-flow   # source of kiro-flow itself
#   export KIRO_FLOW_LOCAL=/path/to/checkout                        # use a local checkout instead
#   export KIRO_FLOW_DRY_RUN=1       # print planned actions, change nothing

set -euo pipefail

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; CYAN='\033[0;36m'
BOLD='\033[1m'; DIM='\033[2m'; NC='\033[0m'

VERSION="${RUFLO_VERSION:-~3.23.0}"
MINIMAL="${KIRO_FLOW_MINIMAL:-0}"
GLOBAL="${KIRO_FLOW_GLOBAL:-0}"
RUN_DOCTOR="${KIRO_FLOW_DOCTOR:-0}"
RUN_INIT="${KIRO_FLOW_INIT:-1}"
REPO="${KIRO_FLOW_REPO:-https://github.com/smashkat12/kiro-flow}"
LOCAL_CHECKOUT="${KIRO_FLOW_LOCAL:-}"
DRY_RUN="${KIRO_FLOW_DRY_RUN:-0}"
INSTALL_DIR="${KIRO_FLOW_HOME:-$HOME/.local/share/kiro-flow}"
BIN_DIR="${KIRO_FLOW_BIN:-$HOME/.local/bin}"

while [[ $# -gt 0 ]]; do
    case $1 in
        --global|-g) GLOBAL="1"; shift ;;
        --minimal|-m) MINIMAL="1"; shift ;;
        --doctor|-d) RUN_DOCTOR="1"; shift ;;
        --init|-i) RUN_INIT="1"; shift ;;
        --no-init) RUN_INIT="0"; shift ;;
        --full|-f) GLOBAL="1"; RUN_DOCTOR="1"; RUN_INIT="1"; shift ;;
        --version=*) VERSION="${1#*=}"; shift ;;
        --dry-run) DRY_RUN="1"; shift ;;
        --help|-h)
            sed -n '3,32p' "$0" 2>/dev/null || true
            echo "Usage: curl -fsSL .../install.sh | bash -s -- [OPTIONS]"
            exit 0 ;;
        *) shift ;;
    esac
done

PACKAGE="ruflo@${VERSION}"

step()    { echo -e "${GREEN}▸${NC} $1"; }
substep() { echo -e "  ${DIM}├─${NC} $1"; }
success() { echo -e "${GREEN}✓${NC} $1"; }
warning() { echo -e "${YELLOW}⚠${NC} $1"; }
error()   { echo -e "${RED}✗${NC} $1"; }

run() {
    if [ "$DRY_RUN" = "1" ]; then
        echo -e "  ${DIM}[dry-run]${NC} $*"
    else
        "$@"
    fi
}

echo ""
echo -e "${CYAN}╔═══════════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║${NC}  ${BOLD}kiro-flow${NC} — ruflo AI orchestration for AWS Kiro         ${CYAN}║${NC}"
echo -e "${CYAN}╚═══════════════════════════════════════════════════════════╝${NC}"
echo ""

# ── requirements ──
step "Checking requirements..."

if command -v node &>/dev/null; then
    NODE_VERSION=$(node -v | sed 's/v//')
    NODE_MAJOR=$(echo "$NODE_VERSION" | cut -d. -f1)
    if [ "$NODE_MAJOR" -ge 20 ]; then
        substep "Node.js ${GREEN}v${NODE_VERSION}${NC} ✓"
    else
        error "Node.js 20+ required (found v${NODE_VERSION})"
        exit 1
    fi
else
    error "Node.js not found — install Node 20+: https://nodejs.org"
    exit 1
fi

command -v npm &>/dev/null && substep "npm ${GREEN}v$(npm -v)${NC} ✓" || { error "npm not found"; exit 1; }

# kiro-cli: check, never install (deliberate divergence from ruflo's installer)
if command -v kiro-cli &>/dev/null; then
    substep "kiro-cli ${GREEN}$(kiro-cli --version 2>/dev/null | head -1 || echo installed)${NC} ✓"
else
    warning "kiro-cli not found"
    substep "Install it with: ${BOLD}curl -fsSL https://cli.kiro.dev/install | bash${NC}"
    substep "(on a governed work machine, prefer your employer's software portal)"
    substep "Continuing anyway — the Kiro IDE alone can use everything this sets up"
fi
echo ""

# ── install ruflo ──
step "Installing ${BOLD}${PACKAGE}${NC} ($([ "$GLOBAL" = "1" ] && echo global || echo npx on-demand)$([ "$MINIMAL" = "1" ] && echo ', minimal'))..."
if [ "$GLOBAL" = "1" ]; then
    if [ "$MINIMAL" = "1" ]; then
        run npm install -g "$PACKAGE" --omit=optional
    else
        run npm install -g "$PACKAGE"
    fi
else
    run npx -y "$PACKAGE" --version >/dev/null 2>&1 || true
    substep "Package cached for npx"
fi
success "ruflo installed"
echo ""

# ── install kiro-flow itself ──
step "Installing kiro-flow..."
if [ -n "$LOCAL_CHECKOUT" ]; then
    KF_ROOT="$LOCAL_CHECKOUT"
    substep "Using local checkout: $KF_ROOT"
else
    if command -v git &>/dev/null; then
        if [ -d "$INSTALL_DIR/.git" ]; then
            run git -C "$INSTALL_DIR" pull --ff-only --quiet
            substep "Updated $INSTALL_DIR"
        else
            run mkdir -p "$(dirname "$INSTALL_DIR")"
            run git clone --depth 1 "$REPO" "$INSTALL_DIR"
            substep "Cloned to $INSTALL_DIR"
        fi
    else
        error "git not found — install git, or set KIRO_FLOW_LOCAL to a checkout"
        exit 1
    fi
    KF_ROOT="$INSTALL_DIR"
fi

run mkdir -p "$BIN_DIR"
if [ "$DRY_RUN" != "1" ]; then
    ln -sf "$KF_ROOT/packages/kiro-flow/bin/kiro-flow.js" "$BIN_DIR/kiro-flow"
    chmod +x "$KF_ROOT/packages/kiro-flow/bin/kiro-flow.js"
fi
substep "Linked $BIN_DIR/kiro-flow"
case ":$PATH:" in
    *":$BIN_DIR:"*) ;;
    *) warning "$BIN_DIR is not on PATH — add: export PATH=\"$BIN_DIR:\$PATH\"" ;;
esac
success "kiro-flow installed"
echo ""

# ── init ──
if [ "$RUN_INIT" = "1" ]; then
    step "Initializing project in $(pwd)..."
    run node "$KF_ROOT/packages/kiro-flow/bin/kiro-flow.js" init || warning "init reported issues — see above"
    echo ""
fi

# ── doctor ──
if [ "$RUN_DOCTOR" = "1" ]; then
    step "Running diagnostics..."
    run node "$KF_ROOT/packages/kiro-flow/bin/kiro-flow.js" doctor || true
    echo ""
fi

echo -e "${CYAN}╔═══════════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║${NC}  ${BOLD}Quick Start${NC}                                              ${CYAN}║${NC}"
echo -e "${CYAN}╚═══════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "  ${DIM}# In your project directory:${NC}"
echo -e "  ${BOLD}kiro-flow init${NC}          ${DIM}# ruflo init + convert 88 agents + MCP wiring${NC}"
echo -e "  ${BOLD}kiro-flow doctor${NC}        ${DIM}# verify kiro-cli, auth, MCP handshake${NC}"
echo ""
echo -e "  ${DIM}# Then in Kiro (IDE or kiro-cli chat):${NC}"
echo -e "  ${BOLD}kiro-cli chat --agent kf-orchestrator${NC}"
echo ""
echo -e "${DIM}kiro-flow: ${REPO}   ruflo (upstream): https://github.com/ruvnet/ruflo${NC}"
echo ""
success "${BOLD}kiro-flow is ready!${NC}"
echo ""
