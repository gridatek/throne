import { Injectable } from '@angular/core';
import { createClient, SupabaseClient, RealtimeChannel } from '@supabase/supabase-js';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class SupabaseService {
  private supabase: SupabaseClient;
  private guestId: string | null = null;

  constructor() {
    this.supabase = createClient(
      environment.supabase.url,
      environment.supabase.anonKey
    );
    this.initializeGuestId();
  }

  private initializeGuestId(): void {
    // Check if guest ID exists in localStorage
    const stored = localStorage.getItem('guest_id');
    if (stored) {
      this.guestId = stored;
    } else {
      // Generate new guest ID
      this.guestId = `guest_${this.generateId()}`;
      localStorage.setItem('guest_id', this.guestId);
    }
  }

  private generateId(): string {
    return Math.random().toString(36).substring(2, 15) +
           Math.random().toString(36).substring(2, 15);
  }

  getClient(): SupabaseClient {
    return this.supabase;
  }

  getCurrentPlayerId(): string {
    // For now, return guest ID. Later can check for authenticated user
    return this.guestId!;
  }

  // Subscribe to real-time changes
  subscribe(
    channel: string,
    event: '*' | 'INSERT' | 'UPDATE' | 'DELETE',
    table: string,
    callback: (payload: any) => void
  ): RealtimeChannel {
    return this.supabase
      .channel(channel)
      .on(
        'postgres_changes' as any,
        { event, schema: 'public', table },
        callback
      )
      .subscribe();
  }

  // Unsubscribe from channel
  unsubscribe(channel: RealtimeChannel): void {
    this.supabase.removeChannel(channel);
  }
}
