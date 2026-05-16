import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Dices, Map, Users, EyeOff, Swords, Sparkles } from "lucide-react";
import heroImage from "@/assets/hero-table.jpg";

const generateCode = () =>
  Array.from({ length: 6 }, () =>
    "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[Math.floor(Math.random() * 32)]
  ).join("");

const Index = () => {
  const navigate = useNavigate();
  const [joinCode, setJoinCode] = useState("");
  const [creating, setCreating] = useState(false);

  const handleCreate = async () => {
    setCreating(true);
    const code = generateCode();
    const { error } = await supabase
      .from("rooms")
      .insert({ code, name: "New Adventure", map_url: "/maps/dungeon.jpg", fog_enabled: false });
    if (error) {
      toast.error("Could not create room");
      setCreating(false);
      return;
    }
    navigate(`/r/${code}`);
  };

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    const code = joinCode.trim().toUpperCase();
    if (!code) return;
    const { data } = await supabase.from("rooms").select("code").eq("code", code).maybeSingle();
    if (!data) {
      toast.error("Room not found");
      return;
    }
    navigate(`/r/${code}`);
  };

  return (
    <div className="min-h-screen">
      <header className="container flex items-center justify-between py-6">
        <div className="flex items-center gap-2">
          <Swords className="h-6 w-6 text-primary" />
          <span className="font-display text-xl font-semibold tracking-wide">Emberforge</span>
        </div>
        <a
          href="https://owlbear.rodeo"
          target="_blank"
          rel="noreferrer noopener"
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          Inspired by Owlbear Rodeo
        </a>
      </header>

      <main className="container">
        <section className="grid gap-12 py-12 md:grid-cols-2 md:items-center md:py-20">
          <div className="space-y-6">
            <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card/60 px-3 py-1 text-xs text-muted-foreground backdrop-blur">
              <Sparkles className="h-3 w-3 text-primary" />
              Real-time virtual tabletop
            </div>
            <h1 className="font-display text-5xl leading-tight md:text-6xl">
              Gather your party. <br />
              <span className="text-gradient-ember">Light the table.</span>
            </h1>
            <p className="max-w-md text-lg text-muted-foreground">
              A lightweight virtual tabletop for tabletop RPGs. Drop a map, place your tokens,
              hide the unknown in fog. Share a link — start playing in seconds.
            </p>

            <div className="flex flex-col gap-3 sm:flex-row">
              <Button
                size="lg"
                variant="hero"
                onClick={handleCreate}
                disabled={creating}
                className="font-display tracking-wide"
              >
                <Dices className="mr-2 h-5 w-5" />
                {creating ? "Forging…" : "Create a Room"}
              </Button>

              <form onSubmit={handleJoin} className="flex gap-2">
                <Input
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                  placeholder="ROOM CODE"
                  maxLength={6}
                  className="w-36 text-center font-mono uppercase tracking-widest"
                />
                <Button type="submit" variant="outline" size="lg">Join</Button>
              </form>
            </div>
          </div>

          <div className="relative">
            <div className="absolute inset-0 -z-10 bg-gradient-ember opacity-30 blur-3xl" />
            <img
              src={heroImage}
              alt="Dark fantasy tabletop with parchment map, dice and miniatures"
              width={1536}
              height={1024}
              className="rounded-2xl border border-border shadow-deep"
            />
          </div>
        </section>

        <section className="grid gap-4 py-12 md:grid-cols-3">
          {[
            { icon: Map, title: "Maps & grid", text: "Drop a battle map, snap to grid, pan and zoom freely." },
            { icon: Users, title: "Real-time", text: "Everything syncs instantly — invite by sharing the room link." },
            { icon: EyeOff, title: "Fog of war", text: "Reveal what your players see. Hide the rest." },
          ].map(({ icon: Icon, title, text }) => (
            <Card key={title} className="border-border bg-card/60 p-6 backdrop-blur transition-smooth hover:border-primary/40 hover:shadow-ember">
              <Icon className="mb-3 h-6 w-6 text-primary" />
              <h3 className="mb-1 font-display text-lg">{title}</h3>
              <p className="text-sm text-muted-foreground">{text}</p>
            </Card>
          ))}
        </section>

        <footer className="border-t border-border py-8 text-center text-sm text-muted-foreground">
          Emberforge VTT · A Lovable build
        </footer>
      </main>
    </div>
  );
};

export default Index;
