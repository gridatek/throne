# 💌 Love Letter - Online Multiplayer Card Game

A real-time multiplayer implementation of the popular card game "Love Letter" built with Angular and Supabase.

![Love Letter](https://img.shields.io/badge/Players-2--8-blue)
![Angular](https://img.shields.io/badge/Angular-21-red)
![Supabase](https://img.shields.io/badge/Supabase-Real--time-green)

## 🎮 About the Game

Love Letter is a game of risk, deduction, and luck. Players attempt to deliver their love letter to the Princess while removing others from the game. Each round is fast-paced, and the first player to collect enough tokens of affection wins!

### Key Features

- 🎯 **2-8 Player Support**: Play with friends or family
- 🔄 **Real-time Multiplayer**: Instant synchronization using Supabase Realtime
- 👤 **No Login Required**: Play as a guest immediately
- 🎨 **Beautiful UI**: Modern design with TailwindCSS
- 📱 **Responsive**: Works on desktop and mobile
- ⚡ **Fast Rounds**: 5-10 minutes per game

## 📚 Documentation

- **[Complete Game Guide](docs/GAME_GUIDE.md)** - Learn how to play Love Letter
- **[E2E Testing Guide](apps/web-e2e/README.md)** - Run and write tests

## 🚀 Quick Start

### Prerequisites

- Node.js 20+
- npm or yarn
- Supabase CLI (for local development)

### Installation

```bash
# Clone the repository
git clone https://github.com/gridatek/throne.git
cd throne

# Install dependencies
npm install
```

### Running Locally

1. **Start Supabase**

```bash
# Build and start Supabase
npx nx run supabase:build
npx nx run supabase:start
```

This will start:
- PostgreSQL database (port 54322)
- API server (port 54321)
- Supabase Studio (port 54323)

2. **Start the Web App**

```bash
npx nx serve web
```

The app will be available at `http://localhost:4200`

3. **Play the Game!**

- Open the app in your browser
- Create a new game or join with a room code
- Share the code with friends to play together

## 🏗️ Project Structure

```
throne/
├── apps/
│   ├── web/                    # Angular web application
│   │   └── src/
│   │       ├── app/
│   │       │   ├── components/ # Game components
│   │       │   ├── services/   # Game & Supabase services
│   │       │   └── models/     # TypeScript interfaces
│   │       └── environments/   # Environment config
│   │
│   ├── admin/                  # Admin application
│   ├── web-e2e/                # E2E tests (Playwright)
│   └── supabase/               # Supabase configuration
│       └── production/
│           └── migrations/     # Database migrations
│
├── docs/                       # Documentation
│   └── GAME_GUIDE.md          # Complete game rules
│
└── .github/
    └── workflows/              # CI/CD workflows
        └── e2e-tests.yml      # Automated testing
```

## 🎯 How to Play

### Creating a Game

1. Enter your name
2. Select the maximum number of players (2-8)
3. Click "Create Game"
4. Share the 6-digit room code with your friends

### Joining a Game

1. Click "Join Existing Game"
2. Enter your name
3. Enter the room code
4. Wait for the host to start the game

### Gameplay

- Each turn, draw a card and play one of your two cards
- Use card effects strategically to eliminate opponents
- Last player standing or highest card wins the round
- First to collect enough tokens wins the game!

**For detailed rules and strategy, see the [Complete Game Guide](docs/GAME_GUIDE.md)**

## 🧪 Testing

### Run E2E Tests

```bash
# Start Supabase first
npx nx run supabase:build
npx nx run supabase:start

# Run tests
npx nx e2e web-e2e

# Run in UI mode
npx playwright test --ui
```

### CI/CD

Tests run automatically on:
- Push to `main`, `develop`, or `feature/**` branches
- Pull requests to `main` or `develop`

See [E2E Testing Guide](apps/web-e2e/README.md) for more details.

## 🎴 The Cards

| Card | Value | Effect |
|------|-------|--------|
| Princess | 8 | Lose if discarded |
| Countess | 7 | Must discard if caught with King/Prince |
| King | 6 | Trade hands with another player |
| Prince | 5 | Force discard and draw |
| Handmaid | 4 | Protection until next turn |
| Baron | 3 | Compare hands; lower loses |
| Priest | 2 | Look at another player's hand |
| Guard | 1 | Guess another player's card |

## 🛠️ Tech Stack

### Frontend
- **Angular 21** - Modern web framework with signals
- **TailwindCSS 4** - Utility-first CSS
- **TypeScript** - Type safety

### Backend
- **Supabase** - Backend as a Service
  - PostgreSQL 17 - Database
  - Realtime - WebSocket connections
  - Row Level Security - Data protection

### DevOps
- **Nx** - Monorepo management
- **Playwright** - E2E testing
- **GitHub Actions** - CI/CD

## 📊 Database Schema

The game uses the following main tables:

- `games` - Game sessions and metadata
- `game_players` - Players in each game
- `game_state` - Current round state (deck, turn, etc.)
- `player_hands` - Cards each player holds
- `game_actions` - Complete action history

All tables have Row Level Security (RLS) policies to ensure data integrity.

## 🔧 Development

### Available Commands

```bash
# Serve web app
npx nx serve web

# Serve admin app
npx nx serve admin

# Build for production
npx nx build web

# Run linting
npx nx lint web

# Run tests
npx nx e2e web-e2e

# Supabase commands (via Nx)
npx nx run supabase:build     # Build Supabase config
npx nx run supabase:start     # Start local instance
npx nx run supabase:stop      # Stop local instance
npx nx run supabase:status    # Check status
npx nx run supabase:db-reset  # Reset database
```

### Environment Variables

The app uses local Supabase by default. Configuration is in:
- `apps/web/src/environments/environment.ts`

For production, update the Supabase URL and anon key.

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Code Style

- Follow Angular style guide
- Use TypeScript strict mode
- Write E2E tests for new features
- Use conventional commits

## 📝 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🎯 Roadmap

- [ ] Add authentication (optional login)
- [ ] Player statistics and leaderboards
- [ ] Game replay system
- [ ] Chat system
- [ ] Custom game modes
- [ ] Achievements
- [ ] Mobile app (Capacitor)
- [ ] AI opponents for solo play
- [ ] Tournament mode

## 🐛 Known Issues

- Game state doesn't persist if you refresh the page (by design)
- Guest IDs are browser-specific (localStorage)

## 📧 Contact

For questions or feedback, please open an issue on GitHub.

---

## Nx Workspace

This project is built with [Nx](https://nx.dev), a powerful build system for monorepos.

### Nx Commands

```bash
# Visualize project graph
npx nx graph

# Show all available targets for a project
npx nx show project web

# Run affected tests only
npx nx affected:test

# Build all projects
npx nx run-many --target=build --all
```

Learn more:
- [Nx Documentation](https://nx.dev)
- [Nx Console for VSCode/IntelliJ](https://nx.dev/getting-started/editor-setup)

---

**Enjoy the game, and may your love letter reach the Princess!** 💌

## Credits

Original game designed by Seiji Kanai, published by AEG.
This is a fan-made digital implementation for educational purposes.
