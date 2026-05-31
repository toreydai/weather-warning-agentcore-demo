"use client"

import { useState } from "react"
import { Menu, X } from "lucide-react"
import Link from "next/link"

export function MobileNav({ links, username, signOutAction }: {
  links: { href: string; label: string }[]
  username: string
  signOutAction: () => Promise<void>
}) {
  const [open, setOpen] = useState(false)

  return (
    <div className="md:hidden">
      <button onClick={() => setOpen(!open)} className="rounded-md p-1.5 hover:bg-muted">
        {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
      </button>
      {open && (
        <div className="absolute right-4 top-16 z-50 rounded-lg border bg-card shadow-lg p-3 space-y-1 min-w-[160px]">
          {links.map(l => (
            <Link key={l.href} href={l.href} onClick={() => setOpen(false)}
              className="block rounded-md px-3 py-2 text-sm hover:bg-muted">{l.label}</Link>
          ))}
          <div className="border-t pt-2 mt-2">
            <span className="block px-3 py-1 text-xs text-muted-foreground">{username}</span>
            <form action={signOutAction}>
              <button className="block w-full text-left rounded-md px-3 py-2 text-sm text-red-600 hover:bg-muted">退出登录</button>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
