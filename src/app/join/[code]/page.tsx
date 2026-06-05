'use client'

// /join/[code] — redirect to landing with ?code= pre-filled
// Handles shareable invite links like https://sketch-club.vercel.app/join/ABC123

import { useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'

export default function JoinRedirectPage() {
  const params = useParams()
  const code = params.code as string
  const router = useRouter()

  useEffect(() => {
    router.replace(`/?code=${code.toUpperCase()}`)
  }, [code, router])

  return (
    <div className="screen" style={{ alignItems: 'center', justifyContent: 'center' }}>
      <div className="spinner" />
    </div>
  )
}
