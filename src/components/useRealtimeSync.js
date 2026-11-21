import { useEffect } from 'react'
import { supabase } from '../lib/supabase.js'

const toNexusFilter = (nexusId) => `nexus_id=eq.${String(nexusId || '').trim()}`

export function useRealtimeSync({ user, tables, onChange }) {
  const tableList = Array.isArray(tables) ? tables : []
  const tableKey = tableList.join('|')

  useEffect(() => {
    const nexusId = String(user?.nexus_id || '').trim()
    if (!nexusId || typeof onChange !== 'function' || tableList.length === 0) return undefined

    const channels = tableList.map((table) => (
      supabase
        .channel(`sync:${table}:${nexusId}:${Math.random().toString(36).slice(2)}`)
        .on('postgres_changes', {
          event: '*',
          schema: 'public',
          table,
          filter: toNexusFilter(nexusId),
        }, onChange)
        .subscribe()
    ))

    return () => {
      channels.forEach((channel) => {
        supabase.removeChannel(channel)
      })
    }
  }, [onChange, tableKey, user?.nexus_id])
}

