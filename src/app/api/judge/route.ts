import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'

interface PlayerInput {
  id: string
  name: string
}

interface JudgeRequest {
  gameId: string
  prompt: string
  criteria: string
  players: PlayerInput[]
}

interface RankedPlayer {
  name: string
  points: number
  roast: string
}

const SYSTEM_PROMPT = `You are an acerbic, theatrical AI art critic who has been dragged into judging a multiplayer drawing game. You have extremely high standards, a wicked sense of humour, and absolutely no patience for bad art — which means you will encounter a lot of suffering today.

Your job: review the list of players who drew the given prompt, and rank them. Since you cannot actually see the drawings, you must judge entirely based on vibes, names, the prompt, and pure theatrical invention. Make it feel real and specific.

Rules:
- Be brutally funny, not cruel. Roast the art, not the person.
- Each roast should be 1-2 sentences. Specific. Vivid. No generic phrases.
- Points are awarded out of 10. Be stingy. No one deserves a 10.
- The winner should have the highest points, but even they should be gently humiliated.
- Vary your vocabulary. Never use "chaos" or "kindergartner" more than once total.
- End with a brief (1 sentence) closing statement about the overall standard of work.

Respond ONLY with valid JSON in this exact format:
{
  "rankings": [
    { "name": "PlayerName", "points": 7, "roast": "The roast text here." },
    ...
  ],
  "closing": "The closing statement here."
}`

export async function POST(req: NextRequest) {
  try {
    const body: JudgeRequest = await req.json()
    const { gameId, prompt, criteria, players } = body

    if (!players || players.length === 0) {
      return NextResponse.json({ error: 'No players' }, { status: 400 })
    }

    const playerList = players.map(p => p.name).join(', ')
    const userMessage = `Prompt: "${prompt}"
Judged by: ${criteria}
Players who submitted drawings: ${playerList}

Please rank all ${players.length} player(s) and roast each one.`

    const anthropicResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY!,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userMessage }],
      }),
    })

    if (!anthropicResponse.ok) {
      const errText = await anthropicResponse.text()
      console.error('Anthropic API error:', errText)
      return NextResponse.json({ error: 'AI judge unavailable' }, { status: 502 })
    }

    const anthropicData = await anthropicResponse.json()
    const rawContent = anthropicData.content?.[0]?.text || ''

    // Parse JSON from response
    let rankings: RankedPlayer[]
    let closing = ''
    try {
      const jsonMatch = rawContent.match(/\{[\s\S]*\}/)
      if (!jsonMatch) throw new Error('No JSON found')
      const parsed = JSON.parse(jsonMatch[0])
      rankings = parsed.rankings || []
      closing = parsed.closing || ''
    } catch (parseErr) {
      console.error('Failed to parse AI response:', parseErr, rawContent)
      // Fallback: assign random points
      rankings = players.map((p, i) => ({
        name: p.name,
        points: Math.max(1, 6 - i),
        roast: 'The judge was too overwhelmed to comment.',
      }))
    }

    // Update players in Supabase
    const supabase = createClient()
    for (const ranked of rankings) {
      const player = players.find(p => p.name === ranked.name)
      if (!player) continue
      await supabase
        .from('players')
        .update({ points: ranked.points, roast: ranked.roast })
        .eq('id', player.id)
    }

    // Update game status to results
    await supabase
      .from('games')
      .update({ status: 'results' })
      .eq('id', gameId)

    return NextResponse.json({ rankings, closing })
  } catch (err) {
    console.error('Judge route error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
