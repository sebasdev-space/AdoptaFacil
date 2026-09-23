import React, { useState } from 'react';
import {
  Building2,
  MapPin,
  Phone,
  Image as ImageIcon,
  FileText,
  Check,
  ExternalLink,
  Instagram,
  Facebook,
  Globe,
  Clock,
  Sparkles,
  Home,
  PawPrint,
  Heart,
  Megaphone,
  ShieldCheck,
  Bell,
  FolderOpen,
  LogOut,
  Moon,
  Sun,
  BadgeCheck,
  Palette,
  ChevronRight,
} from 'lucide-react';

const light = {
  bg: '#F6F7F2',
  surface: '#FFFFFF',
  surfaceAlt: '#EFF3EA',
  border: '#E2E4DA',
  ink: '#1B1F17',
  inkSoft: '#6E7268',
  brand: '#1F6E4C',
  brandDark: '#14512F',
  brandSoft: '#E7F1EA',
  accent: '#D9A62E',
  shadow: '0 8px 24px rgba(20,40,25,0.06)',
};

const dark = {
  bg: '#12140F',
  surface: '#1A1D16',
  surfaceAlt: '#20241A',
  border: '#2C3025',
  ink: '#EDEFE7',
  inkSoft: '#9BA192',
  brand: '#3FA372',
  brandDark: '#8FE0B5',
  brandSoft: '#1F3B2B',
  accent: '#E8BE5A',
  shadow: '0 8px 24px rgba(0,0,0,0.35)',
};

const SWATCHES = ['#1F6E4C', '#2D6CDF', '#C0562E', '#8A3FA0', '#B0202E', '#0E7C86'];

const TABS = [
  { id: 'datos', label: 'Datos institucionales', icon: Building2 },
  { id: 'ubicacion', label: 'Ubicación', icon: MapPin },
  { id: 'contacto', label: 'Contacto', icon: Phone },
  { id: 'medios', label: 'Imágenes y redes', icon: ImageIcon },
  { id: 'acerca', label: 'Acerca de nosotros', icon: FileText },
];

const NAV = [
  { label: 'Inicio', icon: Home },
  { label: 'Adopciones', icon: PawPrint },
  { label: 'Donaciones', icon: Heart },
  { label: 'Mis apadrinamientos', icon: Heart },
  { label: 'Campañas', icon: Megaphone },
  { label: 'Apadrinamientos', icon: Heart },
  { label: 'Animales', icon: PawPrint },
  { label: 'Recordatorios', icon: Bell },
  { label: 'Mi organización', icon: ShieldCheck, active: true },
  { label: 'Documentos', icon: FolderOpen },
];

function Field({ t, label, value, onChange, mono, hint, textarea, placeholder }) {
  const Comp = textarea ? 'textarea' : 'input';
  return (
    <label style={{ display: 'block' }}>
      <span
        style={{
          fontSize: 13,
          fontWeight: 600,
          color: t.ink,
          fontFamily: "'Space Grotesk', sans-serif",
        }}
      >
        {label}
      </span>
      <Comp
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange && onChange(e.target.value)}
        rows={textarea ? 4 : undefined}
        style={{
          marginTop: 6,
          width: '100%',
          padding: '10px 12px',
          borderRadius: 10,
          border: `1px solid ${t.border}`,
          background: t.bg,
          fontSize: 14,
          color: t.ink,
          fontFamily: mono ? "'IBM Plex Mono', monospace" : "'Inter', sans-serif",
          outline: 'none',
          resize: textarea ? 'vertical' : 'none',
          transition: 'border-color .15s ease, box-shadow .15s ease',
        }}
        onFocus={(e) => {
          e.target.style.borderColor = t.brand;
          e.target.style.boxShadow = `0 0 0 3px ${t.brandSoft}`;
        }}
        onBlur={(e) => {
          e.target.style.borderColor = t.border;
          e.target.style.boxShadow = 'none';
        }}
      />
      {hint && (
        <span style={{ fontSize: 12, color: t.inkSoft, marginTop: 4, display: 'block' }}>
          {hint}
        </span>
      )}
    </label>
  );
}

function SectionCard({ t, children }) {
  return (
    <div
      style={{
        background: t.surface,
        border: `1px solid ${t.border}`,
        borderRadius: 16,
        padding: 24,
        display: 'grid',
        gap: 18,
      }}
    >
      {children}
    </div>
  );
}

function TopButton({ t, children, onClick, filled, active }) {
  const [hover, setHover] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '9px 14px',
        borderRadius: 10,
        border: filled ? 'none' : `1px solid ${active ? t.brand : t.border}`,
        background: filled ? t.brand : active ? t.brandSoft : hover ? t.surfaceAlt : t.surface,
        color: filled ? '#fff' : active ? t.brandDark : t.ink,
        fontSize: 13,
        fontWeight: 600,
        cursor: 'pointer',
        transition: 'background .15s ease, border-color .15s ease',
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </button>
  );
}

export default function MiOrganizacion() {
  const [darkMode, setDarkMode] = useState(false);
  const t = darkMode ? dark : light;

  const [tab, setTab] = useState('datos');
  const [nombre, setNombre] = useState('Patitas Team');
  const [descripcion, setDescripcion] = useState(
    'Rescatamos, rehabilitamos y encontramos hogar para perros y gatos en situación de calle en Bogotá.',
  );
  const [ciudad, setCiudad] = useState('Bogotá');
  const [whatsapp, setWhatsapp] = useState('312 513 6296');
  const [portalColor, setPortalColor] = useState('#1F6E4C');
  const [formal, setFormal] = useState(false);
  const [showPersonalizacion, setShowPersonalizacion] = useState(false);

  const camposLlenos = 7;
  const camposTotal = 9;
  const progreso = Math.round((camposLlenos / camposTotal) * 100);

  return (
    <div
      style={{
        background: t.bg,
        minHeight: '100%',
        fontFamily: "'Inter', sans-serif",
        color: t.ink,
        display: 'grid',
        gridTemplateColumns: '232px 1fr',
        transition: 'background .2s ease, color .2s ease',
      }}
    >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600&family=IBM+Plex+Mono:wght@500&display=swap');
        * { box-sizing: border-box; }
        input::placeholder, textarea::placeholder { color: ${t.inkSoft}; opacity: .6; }
        .navitem:hover { background: ${t.surfaceAlt} !important; }
        .swatch:hover { transform: scale(1.1); }
      `}</style>

      {/* App sidebar (existing global nav) */}
      <aside
        style={{
          borderRight: `1px solid ${t.border}`,
          background: t.surface,
          padding: '20px 14px',
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '0 8px',
            marginBottom: 22,
          }}
        >
          <div
            style={{
              width: 30,
              height: 30,
              borderRadius: 8,
              background: t.brand,
              color: '#fff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 700,
              fontFamily: "'Space Grotesk', sans-serif",
              fontSize: 15,
            }}
          >
            A
          </div>
          <span
            style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, fontSize: 16 }}
          >
            AdoptaFácil
          </span>
        </div>

        {NAV.map((item) => {
          const Icon = item.icon;
          return (
            <div
              key={item.label}
              className="navitem"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '9px 10px',
                borderRadius: 9,
                fontSize: 13.5,
                fontWeight: 600,
                color: item.active ? t.brandDark : t.inkSoft,
                background: item.active ? t.brandSoft : 'transparent',
                cursor: 'pointer',
                transition: 'background .15s ease',
              }}
            >
              <Icon size={16} />
              {item.label}
            </div>
          );
        })}

        <div
          style={{
            marginTop: 'auto',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '10px 8px',
            fontSize: 13,
            color: t.inkSoft,
            fontWeight: 600,
          }}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <LogOut size={15} /> sebas
          </span>
          <button
            onClick={() => setDarkMode(!darkMode)}
            title={darkMode ? 'Modo claro' : 'Modo oscuro'}
            style={{
              width: 30,
              height: 30,
              borderRadius: 8,
              border: `1px solid ${t.border}`,
              background: t.surfaceAlt,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              color: t.ink,
            }}
          >
            {darkMode ? <Sun size={14} /> : <Moon size={14} />}
          </button>
        </div>
      </aside>

      {/* Main column */}
      <div>
        {/* Top bar */}
        <div
          style={{
            borderBottom: `1px solid ${t.border}`,
            background: t.surface,
            padding: '18px 28px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 16,
            flexWrap: 'wrap',
          }}
        >
          <div>
            <div
              style={{
                fontSize: 12,
                color: t.inkSoft,
                marginBottom: 2,
                display: 'flex',
                alignItems: 'center',
                gap: 4,
              }}
            >
              Configuración <ChevronRight size={12} /> Mi organización
            </div>
            <h1
              style={{
                margin: 0,
                fontFamily: "'Space Grotesk', sans-serif",
                fontSize: 24,
                fontWeight: 700,
              }}
            >
              Perfil de la organización
            </h1>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
            {/* Completeness meter — signature element */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ position: 'relative', width: 40, height: 40 }}>
                <svg viewBox="0 0 40 40" width="40" height="40">
                  <circle
                    cx="20"
                    cy="20"
                    r="16"
                    fill="none"
                    stroke={t.surfaceAlt}
                    strokeWidth="5"
                  />
                  <circle
                    cx="20"
                    cy="20"
                    r="16"
                    fill="none"
                    stroke={t.brand}
                    strokeWidth="5"
                    strokeLinecap="round"
                    strokeDasharray={`${2 * Math.PI * 16}`}
                    strokeDashoffset={`${2 * Math.PI * 16 * (1 - progreso / 100)}`}
                    transform="rotate(-90 20 20)"
                    style={{ transition: 'stroke-dashoffset .3s ease' }}
                  />
                </svg>
                <span
                  style={{
                    position: 'absolute',
                    inset: 0,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 10,
                    fontWeight: 700,
                    fontFamily: "'Space Grotesk', sans-serif",
                  }}
                >
                  {progreso}%
                </span>
              </div>
              <div style={{ lineHeight: 1.2 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>Perfil incompleto</div>
                <div style={{ fontSize: 12, color: t.inkSoft }}>
                  Faltan 2 campos por diligenciar
                </div>
              </div>
            </div>

            <div style={{ width: 1, height: 28, background: t.border }} />

            <TopButton t={t} onClick={() => setFormal(!formal)} active={formal}>
              <BadgeCheck size={14} color={formal ? t.brandDark : t.inkSoft} />
              Formalización
              <span
                style={{
                  marginLeft: 2,
                  fontSize: 10,
                  fontWeight: 700,
                  padding: '2px 7px',
                  borderRadius: 999,
                  background: formal ? t.brand : t.surfaceAlt,
                  color: formal ? '#fff' : t.inkSoft,
                }}
              >
                {formal ? 'Formal' : 'Informal'}
              </span>
            </TopButton>

            <div style={{ position: 'relative' }}>
              <TopButton
                t={t}
                onClick={() => setShowPersonalizacion(!showPersonalizacion)}
                active={showPersonalizacion}
              >
                <Palette size={14} />
                Personalización
              </TopButton>

              {showPersonalizacion && (
                <div
                  style={{
                    position: 'absolute',
                    top: 'calc(100% + 8px)',
                    right: 0,
                    width: 280,
                    background: t.surface,
                    border: `1px solid ${t.border}`,
                    borderRadius: 14,
                    boxShadow: t.shadow,
                    padding: 18,
                    zIndex: 20,
                  }}
                >
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      fontFamily: "'Space Grotesk', sans-serif",
                      marginBottom: 4,
                    }}
                  >
                    Color de marca del portal
                  </div>
                  <div style={{ fontSize: 12, color: t.inkSoft, marginBottom: 14 }}>
                    Se aplica a la portada y acentos de tu portal público.
                  </div>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                    {SWATCHES.map((c) => (
                      <button
                        key={c}
                        className="swatch"
                        onClick={() => setPortalColor(c)}
                        style={{
                          width: 28,
                          height: 28,
                          borderRadius: 9,
                          background: c,
                          border:
                            portalColor === c ? `2px solid ${t.ink}` : '2px solid transparent',
                          boxShadow: portalColor === c ? `0 0 0 2px ${t.surface}` : 'none',
                          cursor: 'pointer',
                          transition: 'transform .1s ease',
                        }}
                      />
                    ))}
                    <input
                      type="color"
                      value={portalColor}
                      onChange={(e) => setPortalColor(e.target.value)}
                      style={{
                        width: 28,
                        height: 28,
                        padding: 0,
                        border: `1px solid ${t.border}`,
                        borderRadius: 8,
                        cursor: 'pointer',
                      }}
                    />
                  </div>
                </div>
              )}
            </div>

            <TopButton t={t}>
              Ver portal público <ExternalLink size={14} />
            </TopButton>

            <TopButton t={t} filled>
              Guardar cambios
            </TopButton>
          </div>
        </div>

        {/* Section tabs — scoped to this module, sits below the top bar */}
        <div
          style={{
            borderBottom: `1px solid ${t.border}`,
            background: t.surface,
            padding: '0 28px',
            display: 'flex',
            gap: 4,
            overflowX: 'auto',
          }}
        >
          {TABS.map((tb) => {
            const Icon = tb.icon;
            const active = tab === tb.id;
            return (
              <button
                key={tb.id}
                onClick={() => setTab(tb.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 7,
                  padding: '13px 4px',
                  marginRight: 22,
                  border: 'none',
                  borderBottom: `2px solid ${active ? t.brand : 'transparent'}`,
                  background: 'transparent',
                  color: active ? t.brandDark : t.inkSoft,
                  fontSize: 13.5,
                  fontWeight: 600,
                  whiteSpace: 'nowrap',
                  cursor: 'pointer',
                  transition: 'color .15s ease, border-color .15s ease',
                }}
              >
                <Icon size={15} />
                {tb.label}
              </button>
            );
          })}
        </div>

        {/* Body: form + live preview */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0,1fr) 320px',
            gap: 24,
            padding: 28,
            alignItems: 'start',
          }}
        >
          {/* Form panel */}
          <div style={{ display: 'grid', gap: 20 }}>
            {tab === 'datos' && (
              <SectionCard t={t}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                  <Field t={t} label="Nombre" value={nombre} onChange={setNombre} />
                  <Field
                    t={t}
                    label="Slug del portal"
                    value="patitas-team"
                    mono
                    hint="Se usa en /o/<slug>"
                  />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                  <Field t={t} label="NIT" value="1000235504" mono />
                  <Field t={t} label="Razón social" value="Patitas Team" />
                </div>
                <Field
                  t={t}
                  label="Descripción corta"
                  value={descripcion}
                  onChange={setDescripcion}
                  textarea
                  hint="Aparece bajo el nombre de tu organización en el portal público."
                />
              </SectionCard>
            )}

            {tab === 'ubicacion' && (
              <SectionCard t={t}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                  <Field t={t} label="País" value="Colombia" />
                  <Field t={t} label="Departamento" value="Bogotá, D.C." />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                  <Field t={t} label="Ciudad / Municipio" value={ciudad} onChange={setCiudad} />
                  <Field t={t} label="Dirección" value="Cra. 56 #5c-72" />
                </div>
              </SectionCard>
            )}

            {tab === 'contacto' && (
              <SectionCard t={t}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                  <Field t={t} label="Correo de contacto" value="sebjardo@gmail.com" />
                  <Field t={t} label="WhatsApp" value={whatsapp} onChange={setWhatsapp} mono />
                </div>
                <Field
                  t={t}
                  label="Teléfono"
                  value="312 513 6296"
                  mono
                  hint="No se muestra en el portal público."
                />
                <div
                  style={{
                    borderTop: `1px dashed ${t.border}`,
                    paddingTop: 16,
                    display: 'grid',
                    gap: 16,
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      color: t.inkSoft,
                      fontSize: 13,
                      fontWeight: 600,
                    }}
                  >
                    <Clock size={15} /> Información de contacto extendida
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                    <Field t={t} label="Horario de atención" value="Lun-Vie 6am a 5pm" />
                    <Field
                      t={t}
                      label="Teléfonos adicionales"
                      value="324 234 234"
                      mono
                      hint="Separados por coma o uno por línea."
                    />
                  </div>
                  <Field
                    t={t}
                    label="Ubicación en el mapa"
                    value="https://maps.app.goo.gl/2PwBg4MuUnuFYdvZ9"
                    mono
                    hint="Pega el enlace de Google Maps."
                  />
                </div>
              </SectionCard>
            )}

            {tab === 'medios' && (
              <SectionCard t={t}>
                <div style={{ display: 'flex', gap: 20, alignItems: 'center' }}>
                  <div
                    style={{
                      width: 64,
                      height: 64,
                      borderRadius: 16,
                      background: t.surfaceAlt,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: t.brand,
                    }}
                  >
                    <ImageIcon size={24} />
                  </div>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>Logo</div>
                    <button
                      style={{
                        marginTop: 4,
                        background: 'none',
                        border: 'none',
                        color: t.brand,
                        fontWeight: 600,
                        fontSize: 13,
                        cursor: 'pointer',
                        padding: 0,
                      }}
                    >
                      Cambiar logo
                    </button>
                  </div>
                </div>
                <div
                  style={{
                    height: 120,
                    borderRadius: 14,
                    background: `linear-gradient(135deg, ${t.brandSoft}, ${t.surfaceAlt})`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: t.brand,
                    fontSize: 13,
                    fontWeight: 600,
                  }}
                >
                  Portada — Cambiar imagen
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                  <Field t={t} label="Instagram" value="instagram.com/patitas.team" mono />
                  <Field t={t} label="Facebook" value="facebook.com/patitasteam" mono />
                  <Field t={t} label="TikTok" value="tiktok.com/@patitas.team" mono />
                  <Field t={t} label="Sitio web" value="patitasteam.com.co" mono />
                </div>
              </SectionCard>
            )}

            {tab === 'acerca' && (
              <SectionCard t={t}>
                <Field
                  t={t}
                  label="Quiénes somos"
                  textarea
                  value="Somos un equipo voluntario dedicado al rescate y adopción responsable de animales en Bogotá desde 2019."
                  hint="Este texto aparece en la sección “Nosotros” de tu portal público."
                />
              </SectionCard>
            )}
          </div>

          {/* Live preview — reflects personalización in real time */}
          <div style={{ position: 'sticky', top: 28, display: 'grid', gap: 10 }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                fontSize: 12,
                fontWeight: 600,
                color: t.inkSoft,
              }}
            >
              <Sparkles size={13} color={t.accent} />
              VISTA PREVIA DEL PORTAL PÚBLICO
            </div>
            <div
              style={{
                background: t.surface,
                border: `1px solid ${t.border}`,
                borderRadius: 18,
                overflow: 'hidden',
                boxShadow: t.shadow,
              }}
            >
              <div
                style={{
                  height: 90,
                  background: `linear-gradient(135deg, ${portalColor}, ${portalColor}CC)`,
                  transition: 'background .2s ease',
                }}
              />
              <div style={{ padding: '0 18px 18px', marginTop: -28 }}>
                <div
                  style={{
                    width: 56,
                    height: 56,
                    borderRadius: 14,
                    background: portalColor,
                    border: `3px solid ${t.surface}`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#fff',
                    fontFamily: "'Space Grotesk', sans-serif",
                    fontWeight: 700,
                    fontSize: 20,
                    transition: 'background .2s ease',
                  }}
                >
                  {nombre.charAt(0)}
                </div>
                <div
                  style={{
                    marginTop: 10,
                    fontFamily: "'Space Grotesk', sans-serif",
                    fontWeight: 700,
                    fontSize: 17,
                  }}
                >
                  {nombre || 'Nombre de tu organización'}
                </div>
                <div
                  style={{
                    fontSize: 12,
                    color: t.inkSoft,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                    marginTop: 2,
                  }}
                >
                  <MapPin size={12} /> {ciudad || 'Ciudad'}, Colombia
                </div>
                <p style={{ fontSize: 13, color: t.ink, lineHeight: 1.5, marginTop: 10 }}>
                  {descripcion || 'Tu descripción aparecerá aquí.'}
                </p>
                <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
                  <span
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4,
                      fontSize: 11,
                      padding: '5px 9px',
                      borderRadius: 999,
                      background: formal ? t.brandSoft : t.surfaceAlt,
                      color: formal ? t.brandDark : t.inkSoft,
                      fontWeight: 600,
                    }}
                  >
                    {formal ? <BadgeCheck size={11} /> : <Check size={11} />}{' '}
                    {formal ? 'Formal' : 'Informal'}
                  </span>
                  <span
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4,
                      fontSize: 11,
                      padding: '5px 9px',
                      borderRadius: 999,
                      background: t.surfaceAlt,
                      color: t.inkSoft,
                      fontWeight: 600,
                    }}
                  >
                    <Phone size={11} /> {whatsapp}
                  </span>
                </div>
                <div
                  style={{
                    display: 'flex',
                    gap: 10,
                    marginTop: 14,
                    paddingTop: 14,
                    borderTop: `1px solid ${t.border}`,
                  }}
                >
                  <Instagram size={16} color={t.inkSoft} />
                  <Facebook size={16} color={t.inkSoft} />
                  <Globe size={16} color={t.inkSoft} />
                </div>
              </div>
            </div>
            <p style={{ fontSize: 12, color: t.inkSoft, textAlign: 'center', margin: 0 }}>
              Así verán tu organización los adoptantes.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
