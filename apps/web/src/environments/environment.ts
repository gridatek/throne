// Environment configuration is now loaded from /assets/config.json
// This file is kept for backwards compatibility but delegates to ConfigService
// The actual config is loaded at runtime via APP_INITIALIZER in app.config.ts

import { inject } from '@angular/core';
import { ConfigService } from '../app/services/config.service';

let configService: ConfigService | null = null;

// Lazy getter that returns the config from ConfigService
export const environment = new Proxy(
  {},
  {
    get(_target, prop) {
      if (!configService) {
        // Attempt to get ConfigService on first access
        try {
          configService = inject(ConfigService);
        } catch {
          throw new Error(
            'ConfigService not available. Ensure config is loaded via APP_INITIALIZER.'
          );
        }
      }
      const config = configService.getConfig();
      return (config as any)[prop];
    },
  }
) as { production: boolean; supabase: { url: string; anonKey: string } };
