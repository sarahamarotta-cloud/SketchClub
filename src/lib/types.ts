export interface Game {
  id: string
  code: string
  host_name: string
  prompt: string
  criteria: string
  draw_time_secs: number
  status: 'lobby' | 'drawing' | 'waiting' | 'judging' | 'results'
  created_at: string
}

export interface Player {
  id: string
  game_id: string
  name: string
  is_host: boolean
  drawing_url: string | null
  points: number
  roast: string | null
  submitted_at: string | null
  joined_at: string
}
