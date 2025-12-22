# supabase

## Folder Structure

```
apps/supabase/
├── project.json           # Nx targets
├── production/            # Production environment (base configuration)
│   ├── config.toml        # Main Supabase configuration
│   ├── migrations/        # Production migrations
│   └── seeds/             # Production seeds
├── local/                 # Local development overrides
│   ├── migrations/        # Local-only migrations (optional)
│   └── seeds/             # Local-only seeds (optional)
└── .generated/            # AUTO-GENERATED (never edit manually)
    ├── production/        # Built production config
    └── local/             # Built local config (production + local overrides)
```

## How it Works

- **production/** - Your production Supabase configuration (base config for all environments, used directly without copying)
- **local/** - Local development overrides (empty by default, only add what's different from production)
- **.generated/** - Build output for non-production environments (merges production + env overrides)

## Usage

Build environment configurations:

```bash
nx run supabase:build
```

Start/Stop Supabase (convenient shortcuts):

```bash
# Start Supabase (defaults to 'local' environment, runs build first)
nx run supabase:start

# Start with production environment
nx run supabase:start --env=production

# Stop Supabase
nx run supabase:stop
```

Run other Supabase commands:

```bash
# Check status
nx run supabase:run-command --command="supabase status"

# Create migration
nx run supabase:run-command --command="supabase migration new my_table"

# Run any Supabase CLI command
nx run supabase:run-command --env=local --command="supabase db reset"
```
