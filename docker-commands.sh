#!/bin/bash

# EventBuilder AI - Docker Helper Scripts
# Quick commands for common Docker operations

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Functions
print_header() {
    echo -e "${BLUE}================================${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}================================${NC}"
}

print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

print_error() {
    echo -e "${RED}✗ $1${NC}"
}

print_info() {
    echo -e "${YELLOW}ℹ $1${NC}"
}

# Main menu
show_menu() {
    print_header "EventBuilder AI - Docker Control Panel"
    echo ""
    echo "1) Start production server"
    echo "2) Start development server"
    echo "3) Stop all services"
    echo "4) View logs"
    echo "5) Access container shell"
    echo "6) View database"
    echo "7) Rebuild images"
    echo "8) Clean up (remove containers/volumes)"
    echo "9) Health check"
    echo "10) View running containers"
    echo "0) Exit"
    echo ""
}

# Commands
start_production() {
    print_header "Starting Production Server"
    docker-compose up --build
}

start_development() {
    print_header "Starting Development Server"
    docker-compose --profile dev up --build eventbuilder-dev
}

stop_services() {
    print_header "Stopping All Services"
    docker-compose down
    print_success "All services stopped"
}

view_logs() {
    print_header "Viewing Logs"
    echo "Follow logs? (y/n)"
    read -r follow
    if [ "$follow" = "y" ]; then
        docker-compose logs -f
    else
        docker-compose logs --tail 50
    fi
}

access_shell() {
    print_header "Accessing Container Shell"
    print_info "Starting shell... (type 'exit' to quit)"
    docker exec -it eventbuilder-app sh
}

view_database() {
    print_header "Current Database Content"
    if docker exec eventbuilder-app test -f /app/database.json; then
        docker exec eventbuilder-app cat /app/database.json | head -50
        echo ""
        print_info "Full database saved to local database.json"
        docker cp eventbuilder-app:/app/database.json ./database.json.local || true
    else
        print_error "Database file not found"
    fi
}

rebuild_images() {
    print_header "Rebuilding Docker Images"
    docker-compose build --no-cache
    print_success "Images rebuilt"
}

cleanup() {
    print_header "Cleanup Options"
    echo "1) Stop and remove containers"
    echo "2) Stop, remove containers AND delete volumes (WARNING: loses database)"
    echo "0) Cancel"
    read -r cleanup_choice

    case $cleanup_choice in
        1)
            docker-compose down
            print_success "Containers removed"
            ;;
        2)
            print_error "About to delete all volumes (including database)!"
            echo "Type 'yes' to confirm:"
            read -r confirm
            if [ "$confirm" = "yes" ]; then
                docker-compose down -v
                print_success "Containers and volumes removed"
            else
                print_info "Cancelled"
            fi
            ;;
        0)
            print_info "Cancelled"
            ;;
    esac
}

health_check() {
    print_header "Health Check"
    if curl -s http://localhost:8080/api/health > /dev/null; then
        print_success "API is healthy"
        curl -s http://localhost:8080/api/health | head -20
    else
        print_error "API is not responding"
        print_info "Is the container running? Try: docker-compose ps"
    fi
}

view_containers() {
    print_header "Running Containers"
    docker-compose ps
}

# Main loop
if [ $# -eq 0 ]; then
    # Interactive mode
    while true; do
        show_menu
        read -p "Select option: " option
        echo ""

        case $option in
            1) start_production ;;
            2) start_development ;;
            3) stop_services ;;
            4) view_logs ;;
            5) access_shell ;;
            6) view_database ;;
            7) rebuild_images ;;
            8) cleanup ;;
            9) health_check ;;
            10) view_containers ;;
            0)
                print_info "Goodbye!"
                exit 0
                ;;
            *)
                print_error "Invalid option"
                ;;
        esac

        echo ""
        read -p "Press Enter to continue..."
        clear
    done
else
    # Command mode
    case $1 in
        start|prod)
            start_production
            ;;
        dev)
            start_development
            ;;
        stop)
            stop_services
            ;;
        logs)
            view_logs
            ;;
        shell)
            access_shell
            ;;
        db|database)
            view_database
            ;;
        rebuild)
            rebuild_images
            ;;
        clean)
            cleanup
            ;;
        health)
            health_check
            ;;
        ps)
            view_containers
            ;;
        *)
            echo "Usage: $0 {start|prod|dev|stop|logs|shell|db|rebuild|clean|health|ps}"
            exit 1
            ;;
    esac
fi
