"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase, variaveisConfiguradas } from "@/lib/supabase";
import type { Escala, Funcionario, Turno } from "@/lib/tipos";
import {
  DIAS_SEMANA,
  diaMes,
  diasDaSemana,
  hojeISO,
  horaCurta,
  inicioDaSemana,
  paraData,
  rotuloDia,
  somarDias,
} from "@/lib/datas";

type CelulaAberta = { data: string; turno: Turno };

export default function EscalaDaSemana() {
  const [segunda, setSegunda] = useState(() => inicioDaSemana(hojeISO()));
  const [turnos, setTurnos] = useState<Turno[]>([]);
  const [funcionarios, setFuncionarios] = useState<Funcionario[]>([]);
  const [escalas, setEscalas] = useState<Escala[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [celula, setCelula] = useState<CelulaAberta | null>(null);
  const [salvandoId, setSalvandoId] = useState<string | null>(null);

  const dias = useMemo(() => diasDaSemana(segunda), [segunda]);
  const hoje = hojeISO();

  // Turnos e funcionários: carregados uma vez.
  useEffect(() => {
    async function carregarBase() {
      if (!variaveisConfiguradas()) {
        setErro("As variáveis do Supabase não foram configuradas. Veja a tela Início.");
        setCarregando(false);
        return;
      }
      const db = supabase();
      const [t, f] = await Promise.all([
        db.from("turnos").select("id, nome, hora_inicio, hora_fim, ordem").order("ordem"),
        db.from("funcionarios").select("id, nome, funcao, telefone, cpf, ativo").order("nome"),
      ]);
      if (t.error || f.error) {
        setErro(`Não foi possível carregar os dados. Detalhe: ${(t.error ?? f.error)?.message}`);
        return;
      }
      setTurnos(t.data ?? []);
      setFuncionarios(f.data ?? []);
    }
    carregarBase();
  }, []);

  // Escalas da semana mostrada.
  const carregarEscalas = useCallback(async () => {
    if (!variaveisConfiguradas()) return;
    setCarregando(true);
    const { data, error } = await supabase()
      .from("escalas")
      .select("id, data, turno_id, funcionario_id")
      .gte("data", segunda)
      .lte("data", somarDias(segunda, 6));
    if (error) setErro(`Não foi possível carregar a escala. Detalhe: ${error.message}`);
    else setEscalas(data ?? []);
    setCarregando(false);
  }, [segunda]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    carregarEscalas();
  }, [carregarEscalas]);

  const porId = useMemo(
    () => new Map(funcionarios.map((f) => [f.id, f])),
    [funcionarios],
  );

  function escaladosEm(data: string, turnoId: string): Escala[] {
    return escalas.filter((e) => e.data === data && e.turno_id === turnoId);
  }

  // Funcionários ativos agrupados por função, para a janela de escolha.
  const grupos = useMemo(() => {
    const mapa = new Map<string, Funcionario[]>();
    for (const f of funcionarios.filter((f) => f.ativo)) {
      mapa.set(f.funcao, [...(mapa.get(f.funcao) ?? []), f]);
    }
    return [...mapa.entries()].sort(([a], [b]) => a.localeCompare(b, "pt-BR"));
  }, [funcionarios]);

  async function alternar(funcionario: Funcionario) {
    if (!celula) return;
    const existente = escalas.find(
      (e) =>
        e.data === celula.data &&
        e.turno_id === celula.turno.id &&
        e.funcionario_id === funcionario.id,
    );
    setSalvandoId(funcionario.id);
    const db = supabase().from("escalas");
    if (existente) {
      const { error } = await db.delete().eq("id", existente.id);
      if (error) setErro(`Não foi possível remover. Detalhe: ${error.message}`);
      else setEscalas((lista) => lista.filter((e) => e.id !== existente.id));
    } else {
      const { data, error } = await db
        .insert({ data: celula.data, turno_id: celula.turno.id, funcionario_id: funcionario.id })
        .select("id, data, turno_id, funcionario_id")
        .single();
      if (error) setErro(`Não foi possível escalar. Detalhe: ${error.message}`);
      else if (data) setEscalas((lista) => [...lista, data]);
    }
    setSalvandoId(null);
  }

  const escaladosNaCelula = celula ? escaladosEm(celula.data, celula.turno.id) : [];
  const desativadosNaCelula = escaladosNaCelula
    .map((e) => porId.get(e.funcionario_id))
    .filter((f): f is Funcionario => Boolean(f && !f.ativo));

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Escala da semana</h1>

      <div className="cartao space-y-3">
        <p className="text-center text-lg font-semibold">
          {diaMes(dias[0])} a {diaMes(dias[6])}
        </p>
        <div className="grid grid-cols-3 gap-2">
          <button className="botao-secundario whitespace-nowrap px-2" onClick={() => setSegunda(somarDias(segunda, -7))}>
            ◀ Voltar
          </button>
          <button
            className="botao-secundario"
            onClick={() => setSegunda(inicioDaSemana(hojeISO()))}
            disabled={segunda === inicioDaSemana(hoje)}
          >
            Hoje
          </button>
          <button className="botao-secundario whitespace-nowrap px-2" onClick={() => setSegunda(somarDias(segunda, 7))}>
            Avançar ▶
          </button>
        </div>
      </div>

      {erro && (
        <p className="cartao border-red-200 bg-red-50 text-red-800">
          {erro}{" "}
          <button className="underline" onClick={() => setErro(null)}>
            Fechar
          </button>
        </p>
      )}

      <p className="text-sm text-neutral-600">
        Toque numa célula para escolher quem trabalha. No celular, arraste a grade para o lado.
      </p>

      <div className={`cartao overflow-x-auto p-0 ${carregando ? "opacity-60" : ""}`}>
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr>
              <th className="sticky left-0 z-[1] bg-white p-2 text-left">Turno</th>
              {dias.map((d) => (
                <th
                  key={d}
                  className={`min-w-[6.5rem] p-2 text-center ${d === hoje ? "text-principal underline" : ""}`}
                >
                  {rotuloDia(d)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {turnos.map((t) => (
              <tr key={t.id} className="border-t border-neutral-200">
                <th className="sticky left-0 z-[1] bg-white p-2 text-left align-top">
                  <span className="block font-semibold">{t.nome}</span>
                  <span className="block text-xs font-normal text-neutral-500">
                    {horaCurta(t.hora_inicio)}–{horaCurta(t.hora_fim)}
                  </span>
                </th>
                {dias.map((d) => {
                  const lista = escaladosEm(d, t.id);
                  return (
                    <td key={d} className="p-1 align-top">
                      <button
                        className="flex min-h-[5rem] w-full flex-col items-start gap-1 rounded-xl border border-neutral-200 bg-neutral-50 p-2 text-left active:bg-neutral-100"
                        onClick={() => setCelula({ data: d, turno: t })}
                      >
                        {lista.length === 0 ? (
                          <span className="text-neutral-400">+ Escalar</span>
                        ) : (
                          lista.map((e) => (
                            <span key={e.id} className="leading-tight">
                              {porId.get(e.funcionario_id)?.nome.split(" ")[0] ?? "?"}
                            </span>
                          ))
                        )}
                        {lista.length > 0 && (
                          <span className="mt-auto text-xs text-neutral-500">
                            {lista.length} {lista.length === 1 ? "pessoa" : "pessoas"}
                          </span>
                        )}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
        {turnos.length === 0 && !carregando && !erro && (
          <p className="p-4 text-neutral-600">Nenhum turno cadastrado no banco.</p>
        )}
      </div>

      {celula && (
        <div
          className="fixed inset-0 z-20 flex items-end justify-center bg-black/40 sm:items-center"
          onClick={() => setCelula(null)}
        >
          <div
            className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white p-4 sm:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-xl font-bold">
              {celula.turno.nome} · {DIAS_SEMANA[paraData(celula.data).getDay()]}{" "}
              {diaMes(celula.data)}
            </h2>
            <p className="mb-3 text-sm text-neutral-600">
              Marque quem trabalha. Cada toque já fica salvo.
            </p>

            {grupos.map(([funcao, lista]) => (
              <section key={funcao} className="mb-3">
                <h3 className="mb-1 text-sm font-semibold uppercase text-neutral-500">{funcao}</h3>
                <ul className="space-y-2">
                  {lista.map((f) => {
                    const marcado = escaladosNaCelula.some((e) => e.funcionario_id === f.id);
                    return (
                      <li key={f.id}>
                        <label
                          className={`flex min-h-[3.25rem] cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 ${
                            marcado ? "border-principal bg-secundaria" : "border-neutral-300"
                          }`}
                        >
                          <input
                            type="checkbox"
                            className="h-6 w-6 accent-[var(--cor-principal)]"
                            checked={marcado}
                            disabled={salvandoId === f.id}
                            onChange={() => alternar(f)}
                          />
                          <span className="text-base">{f.nome}</span>
                          {salvandoId === f.id && (
                            <span className="ml-auto text-xs text-neutral-500">Salvando...</span>
                          )}
                        </label>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}

            {desativadosNaCelula.length > 0 && (
              <section className="mb-3">
                <h3 className="mb-1 text-sm font-semibold uppercase text-neutral-500">
                  Desativados (escalados antes)
                </h3>
                <ul className="space-y-2">
                  {desativadosNaCelula.map((f) => (
                    <li
                      key={f.id}
                      className="flex items-center justify-between rounded-xl border border-neutral-200 px-4 py-3 opacity-70"
                    >
                      <span>{f.nome}</span>
                      <button className="text-sm text-red-700 underline" onClick={() => alternar(f)}>
                        Remover
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <button className="botao sticky bottom-0 mt-2 w-full" onClick={() => setCelula(null)}>
              Pronto
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
