import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { CheckCircle, Clock, Package, Bell, Trash2, Plus, LogIn, ShoppingBag, Home as HomeIcon, LayoutDashboard, LogOut, ChevronRight, Star, Instagram, Facebook, MessageCircle, MapPin, Database, Calendar, Search, Upload, Image as ImageIcon, Loader2, Sun, Moon } from 'lucide-react';
import { supabase, isSupabaseConfigured } from './lib/supabase';
import { ManagerialDashboard } from './components/ManagerialDashboard';
import { SensorEntry, WeatherDay } from './types/analytics';

const IceCreamIcon = ({ className = "w-6 h-6" }: { className?: string }) => (
  <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M4 22C4 26 10 28 16 28S28 26 28 22H4Z" />
    <path d="M8 28C8 30 12 31 16 31S24 30 24 28" />
    <path d="M7 22C7 18 10 16 13 16S19 18 19 22" />
    <path d="M13 22C13 18 16 16 19 16S25 18 25 22" />
    <path d="M10 16C10 12 13 10 16 10S22 12 22 16" />
    <path d="M13 18C13 20 14 21 15 21" />
    <path d="M17 18C17 20 18 21 19 21" />
    <path d="M21 18C21 20 22 21 23 21" />
    <circle cx="16" cy="7" r="2.5" fill="currentColor" />
    <path d="M16 4.5C16 3 17 2 18 2" />
    <path d="M6 6L11 11" />
  </svg>
);

const AcaiIcon = ({ className = "w-6 h-6" }: { className?: string }) => (
  <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M4 22C4 26 10 28 16 28S28 26 28 22H4Z" />
    <path d="M8 28C8 30 12 31 16 31S24 30 24 28" />
    <path d="M7 22C7 18 10 16 13 16S19 18 19 22" />
    <path d="M13 22C13 18 16 16 19 16S25 18 25 22" />
    <path d="M10 16C10 12 13 10 16 10S22 12 22 16" />
    <path d="M13 18C13 20 14 21 15 21" />
    <path d="M17 18C17 20 18 21 19 21" />
    <path d="M21 18C21 20 22 21 23 21" />
    <circle cx="14" cy="8" r="1.5" fill="currentColor" />
    <circle cx="18" cy="7" r="1.5" fill="currentColor" />
    <circle cx="16" cy="10" r="1.5" fill="currentColor" />
    <path d="M6 6L11 11" />
  </svg>
);

const ProductImage = ({ src, alt, className = "" }: { src: string, alt: string, className?: string }) => {
  const [isLoaded, setIsLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);
  const finalClassName = className.replace('transition-transform', 'transition-all');

  return (
    <>
      {!isLoaded && !hasError && (
        <div className="absolute inset-0 bg-slate-100 dark:bg-slate-800 flex items-center justify-center z-0">
          <Loader2 className="w-8 h-8 text-pink-300 dark:text-pink-400 animate-spin" />
        </div>
      )}
      {hasError || !src ? (
        <div className="absolute inset-0 bg-pink-50 dark:bg-slate-800/80 flex flex-col items-center justify-center z-10 text-pink-400 dark:text-pink-500 p-4 text-center">
          <Package size={32} className="mb-1 opacity-70" />
          <span className="text-[11px] font-semibold opacity-90 line-clamp-1">{alt}</span>
        </div>
      ) : (
        <img
          src={src}
          alt={alt}
          className={`${finalClassName} ${isLoaded ? 'opacity-100' : 'opacity-0'} relative z-10`}
          onLoad={() => setIsLoaded(true)}
          onError={() => setHasError(true)}
          referrerPolicy="no-referrer"
        />
      )}
    </>
  );
};

interface Order {
  id: number;
  customer_name: string;
  items: string;
  status: 'pending' | 'ready' | 'delivered';
  created_at: string;
}

interface Product {
  id: number;
  name: string;
  description: string;
  ingredients: string;
  price: string;
  image: string;
  category: 'acai' | 'sorvete';
}

export default function App() {
  const [currentPage, setCurrentPage] = useState<'home' | 'products' | 'login' | 'dashboard'>('home');
  const [activeCategory, setActiveCategory] = useState<'all' | 'acai' | 'sorvete'>('all');
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [heroImageIndex, setHeroImageIndex] = useState(0);
  const [orders, setOrders] = useState<Order[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [orderFormError, setOrderFormError] = useState('');
  const [imageUploadError, setImageUploadError] = useState('');
  const [dashboardTab, setDashboardTab] = useState<'orders' | 'deliveries' | 'products' | 'managerial'>('orders');
  const [sensorEntries, setSensorEntries] = useState<SensorEntry[]>([]);
  const [lastSensorSignalAt, setLastSensorSignalAt] = useState<string | null>(null);
  const [generatingSample, setGeneratingSample] = useState(false);
  const [sampleOrders, setSampleOrders] = useState<Order[]>(() => {
    try {
      const saved = localStorage.getItem('mari_acai_sample_orders_v1');
      return saved ? JSON.parse(saved) : [];
    } catch (_) {
      return [];
    }
  });
  const [sampleCatalog, setSampleCatalog] = useState<Product[]>(() => {
    try {
      const saved = localStorage.getItem('mari_acai_sample_catalog_v1');
      return saved ? JSON.parse(saved) : [];
    } catch (_) {
      return [];
    }
  });
  const today = new Date().toISOString().split('T')[0];
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [newOrderName, setNewOrderName] = useState('');
  const [newOrderItems, setNewOrderItems] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showAddProductModal, setShowAddProductModal] = useState(false);
  const [selectedOrderProducts, setSelectedOrderProducts] = useState<{ productId: number, quantity: number }[]>([]);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [supabaseStatus, setSupabaseStatus] = useState<'connected' | 'error' | 'not_configured'>('not_configured');

  // Theme State (light / dark) with localStorage persistence and system preference fallback
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('theme');
      if (saved === 'dark' || saved === 'light') return saved;
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    return 'light';
  });

  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    try {
      localStorage.setItem('theme', theme);
    } catch (_) {}
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => (prev === 'light' ? 'dark' : 'light'));
  };

  // New Product Form State
  const [searchQuery, setSearchQuery] = useState('');
  const [newProductName, setNewProductName] = useState('');
  const [newProductDesc, setNewProductDesc] = useState('');
  const [newProductIng, setNewProductIng] = useState('');
  const [newProductPrice, setNewProductPrice] = useState('');
  const [newProductImage, setNewProductImage] = useState('');
  const [newProductCategory, setNewProductCategory] = useState<'acai' | 'sorvete'>('acai');
  const [uploading, setUploading] = useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  useEffect(() => {
    setSearchQuery('');
  }, [currentPage, dashboardTab]);

  useEffect(() => {
    const checkSupabase = async () => {
      if (!isSupabaseConfigured || !supabase) {
        setSupabaseStatus('not_configured');
        return;
      }
      try {
        // Try searching for any response, not necessarily a successful table read
        // because the user might not have tables yet
        const { error } = await supabase.from('products').select('*', { count: 'exact', head: true }).limit(1);
        
        if (error && error.code === 'PGRST116') {
          // Table doesn't exist yet, but connection is alive
          setSupabaseStatus('connected');
        } else if (error) {
          // Other error (maybe auth/network)
          console.error('Supabase connection error check:', error);
          setSupabaseStatus('connected'); // Still set to connected to allow attempt
        } else {
          setSupabaseStatus('connected');
        }
      } catch (err) {
        console.error('Supabase initialization catch:', err);
        setSupabaseStatus('connected'); // Set to connected to try fetching anyway
      }
    };
    checkSupabase();
  }, []);

  // Login state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [authSuccessMessage, setAuthSuccessMessage] = useState('');
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login');
  const [loggingIn, setLoggingIn] = useState(false);

  useEffect(() => {
    if (!supabase) return;

    // Check current session
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setIsLoggedIn(true);
        setCurrentPage('dashboard');
      }
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        setIsLoggedIn(true);
      } else {
        setIsLoggedIn(false);
        setCurrentPage('home');
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const fetchProducts = async () => {
    if (!supabase) {
      setLoadingProducts(false);
      return;
    }
    try {
      setLoadingProducts(true);
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .order('id', { ascending: true });
      
      if (error) {
        console.error('Supabase fetch products error:', error);
        return;
      }
      
      // Carregar exclusivamente os produtos vindos do banco de dados
      setProducts(data || []);
    } catch (error) {
      console.error('Supabase fetch products error:', error);
    } finally {
      setLoadingProducts(false);
    }
  };

  const fetchOrders = async () => {
    if (!isLoggedIn) return;

    // Use Supabase if configured
    if (supabaseStatus === 'connected' && supabase) {
      try {
        const { data, error } = await supabase
          .from('orders')
          .select('*')
          .order('created_at', { ascending: false });
        
        if (error) throw error;
        setOrders(data || []);
      } catch (error) {
        console.error('Supabase fetch error:', error);
      }
    }
  };

  useEffect(() => {
    const interval = setInterval(() => {
      setHeroImageIndex((prev) => (prev === 0 ? 1 : 0));
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 20);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    fetchProducts();

    // Sincronização em tempo real das alterações na tabela de produtos
    let channel: any = null;
    if (supabase) {
      channel = supabase
        .channel('public:products')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'products' },
          () => {
            fetchProducts();
          }
        )
        .subscribe();
    }

    return () => {
      if (channel && supabase) {
        supabase.removeChannel(channel);
      }
    };
  }, [supabaseStatus]);

  const fetchSensorEntries = async () => {
    try {
      const res = await fetch('/api/esp32/entries');
      if (!res.ok) return;
      const data = await res.json();
      if (Array.isArray(data.entries)) {
        setSensorEntries(data.entries);
        const latestReal = data.entries.find((e: SensorEntry) => e.source !== 'sample') || data.entries[0];
        if (latestReal) {
          setLastSensorSignalAt(latestReal.created_at);
        }
      }
    } catch (err) {
      console.error('Error fetching sensor entries:', err);
    }
  };

  useEffect(() => {
    if (isLoggedIn) {
      fetchOrders();
      fetchSensorEntries();

      // Polling fallback to keep kitchen orders and sensor entries updated reliably
      const interval = setInterval(() => {
        fetchOrders();
        fetchSensorEntries();
      }, 5000);

      // WebSocket listener for instant ESP32 door sensor readings
      let ws: WebSocket | null = null;
      try {
        const wsProto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        ws = new WebSocket(`${wsProto}//${window.location.host}`);
        ws.onmessage = (event) => {
          try {
            const msg = JSON.parse(event.data);
            if (msg.type === 'SENSOR_ENTRY' && msg.entry) {
              setSensorEntries((prev) => [msg.entry, ...prev]);
              setLastSensorSignalAt(msg.entry.created_at);
            } else if (msg.type === 'SENSOR_SAMPLE_UPDATED') {
              fetchSensorEntries();
            }
          } catch (_) {}
        };
      } catch (_) {}

      // Real-time with Supabase
      let supabaseSubscription: any = null;
      if (supabaseStatus === 'connected' && supabase) {
        try {
          supabaseSubscription = supabase
            .channel('orders_changes')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => {
              fetchOrders();
            })
            .subscribe();
        } catch (e) {
          console.warn('Realtime subscription fallback to polling:', e);
        }
      }

      return () => {
        clearInterval(interval);
        if (ws) {
          try {
            ws.close();
          } catch (_) {}
        }
        if (supabaseSubscription && supabase) {
          try {
            supabase.removeChannel(supabaseSubscription);
          } catch (_) {}
        }
      };
    }
  }, [isLoggedIn, supabaseStatus]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');
    setAuthSuccessMessage('');
    setLoggingIn(true);

    if (supabaseStatus === 'connected' && supabase) {
      try {
        if (authMode === 'signup') {
          const { data, error } = await supabase.auth.signUp({
            email,
            password,
          });

          if (error) {
            setLoginError(error.message);
            setLoggingIn(false);
            return;
          }

          if (data.session) {
            setIsLoggedIn(true);
            setCurrentPage('dashboard');
          } else {
            setAuthSuccessMessage('Conta criada com sucesso! Se necessário, confirme o e-mail cadastrado ou faça o login.');
            setAuthMode('login');
          }
        } else {
          const { error } = await supabase.auth.signInWithPassword({
            email,
            password,
          });

          if (error) {
            let msg = error.message;
            if (error.message === 'Invalid login credentials') {
              msg = 'Credenciais inválidas. Verifique seu e-mail e senha cadastrados no Supabase.';
            } else if (error.message.toLowerCase().includes('email not confirmed')) {
              msg = 'E-mail ainda não confirmado no Supabase. Marque "Auto Confirm User" no painel do Supabase.';
            }
            setLoginError(msg);
            setLoggingIn(false);
            return;
          }

          setIsLoggedIn(true);
          setCurrentPage('dashboard');
        }
      } catch (err: any) {
        console.error('Login error:', err);
        setLoginError('Erro ao conectar ao servidor: ' + (err?.message || 'Tente novamente'));
      } finally {
        setLoggingIn(false);
      }
    } else {
      setLoginError('Supabase não conectado. Verifique suas credenciais.');
      setLoggingIn(false);
    }
  };

  const handleLogout = async () => {
    if (supabase) {
      await supabase.auth.signOut();
    }
    setIsLoggedIn(false);
    setCurrentPage('home');
  };

  const simulateSensorPass = async () => {
    try {
      await fetch('/api/esp32/led', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: '1', source: 'manual' })
      });
      await fetchSensorEntries();
    } catch (error) {
      console.error('Error simulating sensor pass:', error);
    }
  };

  const generateSampleHistory = async (weatherDaily: WeatherDay[]) => {
    setGeneratingSample(true);
    try {
      const fallbackCatalog: Product[] = products.length > 0 ? products : [
        { id: 9001, name: 'Açaí Tradicional 500ml', description: '', ingredients: '', price: 'R$ 22,00', image: '', category: 'acai' },
        { id: 9002, name: 'Açaí com Nutella 400ml', description: '', ingredients: '', price: 'R$ 26,00', image: '', category: 'acai' },
        { id: 9003, name: 'Copo da Felicidade Açaí', description: '', ingredients: '', price: 'R$ 28,00', image: '', category: 'acai' },
        { id: 9004, name: 'Sorvete Artesanal 2 Bolas', description: '', ingredients: '', price: 'R$ 16,00', image: '', category: 'sorvete' },
        { id: 9005, name: 'Milkshake Gourmet 400ml', description: '', ingredients: '', price: 'R$ 21,00', image: '', category: 'sorvete' },
      ];
      if (products.length === 0) {
        setSampleCatalog(fallbackCatalog);
        try {
          localStorage.setItem('mari_acai_sample_catalog_v1', JSON.stringify(fallbackCatalog));
        } catch (_) {}
      }

      const customerNames = ['Ana Paula', 'Lucas Mendes', 'Beatriz Costa', 'Rafael Souza', 'Camila Rocha', 'Pedro Henrique', 'Juliana Alves', 'Gabriel Lima', 'Mariana Dias', 'Thiago Oliveira'];
      const weatherByDate = new Map(weatherDaily.map(w => [w.date, w]));
      const generatedOrders: Order[] = [];
      const generatedCrossings: Array<{ status: string; created_at: string }> = [];

      let orderIdCounter = 900000;
      const now = new Date();

      for (let daysAgo = 29; daysAgo >= 0; daysAgo--) {
        const dayDate = new Date(now);
        dayDate.setDate(now.getDate() - daysAgo);
        const yyyy = dayDate.getFullYear();
        const mm = String(dayDate.getMonth() + 1).padStart(2, '0');
        const dd = String(dayDate.getDate()).padStart(2, '0');
        const dateKey = `${yyyy}-${mm}-${dd}`;
        const dow = dayDate.getDay();
        const isWeekend = dow === 0 || dow === 6;

        const w = weatherByDate.get(dateKey);
        const tempMax = w ? w.tempMax : (24 + ((daysAgo * 3) % 9));
        const precip = w ? w.precipitationSum : (daysAgo % 6 === 0 ? 6.5 : 0);

        const dowMultiplier = [1.35, 0.72, 0.78, 0.85, 0.94, 1.18, 1.42][dow];
        const tempBonus = Math.max(0.6, 1 + (tempMax - 25) * 0.045);
        const rainFactor = precip > 4 ? 0.6 : precip > 1.5 ? 0.75 : 1.0;

        // Deterministic realistic noise
        const jitter = 0.9 + ((daysAgo * 7) % 5) * 0.05;
        const estimatedVisitors = Math.max(8, Math.round(24 * dowMultiplier * tempBonus * rainFactor * jitter));
        const convRate = Math.min(0.82, Math.max(0.42, (tempMax >= 28 ? 0.64 : 0.54) - (precip >= 1.5 ? 0.06 : 0)));
        const ordersForDay = Math.max(3, Math.round(estimatedVisitors * convRate));

        const openHour = isWeekend ? 12 : 14;
        const closeHour = isWeekend ? 22 : 21;
        const hourSpan = closeHour - openHour;

        // 2 crossings per visitor (single door: enter + exit)
        for (let v = 0; v < estimatedVisitors; v++) {
          // Peak around afternoon/evening
          const offsetHr = Math.min(hourSpan, Math.floor(((v * 3 + daysAgo) % 100) / 100 * (hourSpan + 1)));
          const enterHr = openHour + offsetHr;
          const enterMin = (v * 13 + daysAgo * 7) % 55;
          const enterDt = new Date(yyyy, dayDate.getMonth(), dayDate.getDate(), enterHr, enterMin, (v * 11) % 50);
          const exitDt = new Date(enterDt.getTime() + (12 + (v % 20)) * 60000);
          generatedCrossings.push({ status: '1', created_at: enterDt.toISOString() });
          generatedCrossings.push({ status: '1', created_at: exitDt.toISOString() });
        }

        // 2 employees × 4 crossings/day (arrival, lunch out, lunch back, closing exit)
        const staffSchedules = [
          { h: openHour, m: 2 },
          { h: openHour + 3, m: 15 },
          { h: openHour + 4, m: 5 },
          { h: closeHour, m: 45 },
        ];
        for (let emp = 0; emp < 2; emp++) {
          for (const sched of staffSchedules) {
            const empDt = new Date(yyyy, dayDate.getMonth(), dayDate.getDate(), sched.h, sched.m + emp * 3, 10 + emp * 15);
            generatedCrossings.push({ status: '1', created_at: empDt.toISOString() });
          }
        }

        // Generate orders distributed across business hours
        for (let o = 0; o < ordersForDay; o++) {
          const ordHr = openHour + Math.min(hourSpan, Math.floor(((o * 7 + daysAgo) % 100) / 100 * (hourSpan + 1)));
          const ordMin = (o * 17 + daysAgo * 5) % 58;
          const ordDt = new Date(yyyy, dayDate.getMonth(), dayDate.getDate(), ordHr, ordMin, 0);

          const p1 = fallbackCatalog[(o + daysAgo) % fallbackCatalog.length];
          const p2 = fallbackCatalog[(o + daysAgo + 2) % fallbackCatalog.length];
          const qty1 = (o + daysAgo) % 3 === 0 ? 2 : 1;
          const itemsStr = (o % 2 === 0 && fallbackCatalog.length > 1)
            ? `${qty1}x ${p1.name}, 1x ${p2.name}`
            : `${qty1}x ${p1.name}`;

          generatedOrders.push({
            id: orderIdCounter++,
            customer_name: customerNames[(o + daysAgo) % customerNames.length],
            items: itemsStr,
            status: 'delivered',
            created_at: ordDt.toISOString(),
          });
        }
      }

      setSampleOrders(generatedOrders);
      try {
        localStorage.setItem('mari_acai_sample_orders_v1', JSON.stringify(generatedOrders));
      } catch (_) {}

      await fetch('/api/esp32/entries/sample', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entries: generatedCrossings })
      });
      await fetchSensorEntries();
    } catch (error) {
      console.error('Error generating sample history:', error);
    } finally {
      setGeneratingSample(false);
    }
  };

  const clearSampleHistory = async () => {
    setGeneratingSample(true);
    try {
      setSampleOrders([]);
      setSampleCatalog([]);
      try {
        localStorage.removeItem('mari_acai_sample_orders_v1');
        localStorage.removeItem('mari_acai_sample_catalog_v1');
      } catch (_) {}
      await fetch('/api/esp32/entries/sample', { method: 'DELETE' });
      await fetchSensorEntries();
    } catch (error) {
      console.error('Error clearing sample history:', error);
    } finally {
      setGeneratingSample(false);
    }
  };

  const markAsReady = async (id: number) => {
    if (supabaseStatus === 'connected' && supabase) {
      try {
        const { error } = await supabase
          .from('orders')
          .update({ status: 'ready' })
          .eq('id', id);
        if (error) throw error;
        fetchOrders();
      } catch (error) {
        console.error('Supabase update error:', error);
      }
    }
  };

  const markAsDelivered = async (id: number) => {
    if (supabaseStatus === 'connected' && supabase) {
      try {
        const { error } = await supabase
          .from('orders')
          .update({ status: 'delivered' })
          .eq('id', id);
        if (error) throw error;
        fetchOrders();
      } catch (error) {
        console.error('Supabase update error:', error);
      }
    }
  };

  const createOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Format items string from selected products
    const itemsList = selectedOrderProducts
      .map(item => {
        const product = products.find(p => p.id === item.productId);
        return product ? `${item.quantity}x ${product.name}` : '';
      })
      .filter(Boolean)
      .join(', ');

    if (!itemsList && !newOrderItems) {
      setOrderFormError('Selecione pelo menos um produto ou descreva o pedido.');
      return;
    }
    setOrderFormError('');

    const finalItems = itemsList || newOrderItems;

    if (supabaseStatus === 'connected' && supabase) {
      try {
        if (editingOrder) {
          const { error } = await supabase
            .from('orders')
            .update({ 
              customer_name: newOrderName, 
              items: finalItems
            })
            .eq('id', editingOrder.id);
          if (error) throw error;
        } else {
          const { error } = await supabase
            .from('orders')
            .insert([{ 
              customer_name: newOrderName, 
              items: finalItems,
              status: 'pending'
            }]);
          if (error) throw error;
        }
        
        resetOrderForm();
        fetchOrders();
      } catch (error) {
        console.error('Supabase order operation error:', error);
      }
    }
  };

  const resetOrderForm = () => {
    setNewOrderName('');
    setNewOrderItems('');
    setSelectedOrderProducts([]);
    setEditingOrder(null);
    setOrderFormError('');
    setShowAddModal(false);
  };

  const openAddOrder = () => {
    resetOrderForm();
    setShowAddModal(true);
  };

  const openEditOrder = (order: Order) => {
    setEditingOrder(order);
    setNewOrderName(order.customer_name);
    setNewOrderItems(order.items);
    setOrderFormError('');
    setShowAddModal(true);
  };

  const deleteOrder = async (id: number) => {
    if (supabase) {
      try {
        const { error } = await supabase.from('orders').delete().eq('id', id);
        if (error) throw error;
        fetchOrders();
      } catch (error) {
        console.error('Supabase delete order error:', error);
      }
    } else {
      setOrders(orders.filter(o => o.id !== id));
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImageUploadError('');

    if (!supabase) {
      setImageUploadError('Supabase não está conectado para upload de imagens.');
      return;
    }

    setUploading(true);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${Math.random()}.${fileExt}`;

      // Try server-side S3 upload first (using the endpoint provided by user)
      try {
        const presignedResponse = await fetch('/api/storage/presigned-url', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fileName, contentType: file.type })
        });

        if (presignedResponse.ok) {
          const contentType = presignedResponse.headers.get('content-type');
          if (!contentType || !contentType.includes('application/json')) {
            throw new Error('Servidor retornou uma resposta inválida (não JSON). Verifique se o servidor está rodando corretamente.');
          }
          const { uploadUrl, publicUrl } = await presignedResponse.json();
          const uploadRes = await fetch(uploadUrl, {
            method: 'PUT',
            body: file,
            headers: { 'Content-Type': file.type }
          });

          if (uploadRes.ok) {
            setNewProductImage(publicUrl);
            return;
          }
        }
      } catch (s3Error) {
        console.warn('Server-side S3 upload failed, falling back to standard SDK:', s3Error);
      }

      // Fallback to standard Supabase SDK clientside upload
      const filePath = `${fileName}`;
      const { error: uploadError } = await supabase.storage
        .from('imagens')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('imagens')
        .getPublicUrl(filePath);

      setNewProductImage(publicUrl);
    } catch (error: any) {
      console.error('Error uploading image:', error);
      setImageUploadError(error?.message || 'Erro ao carregar imagem.');
    } finally {
      setUploading(false);
    }
  };

  const createProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (supabase) {
      try {
        const productData = { 
          name: newProductName,
          description: newProductDesc,
          ingredients: newProductIng,
          price: newProductPrice,
          image: newProductImage || 'https://picsum.photos/seed/new/400/300',
          category: newProductCategory
        };

        if (editingProduct) {
          const { error } = await supabase
            .from('products')
            .update(productData)
            .eq('id', editingProduct.id);
          if (error) throw error;
        } else {
          const { error } = await supabase
            .from('products')
            .insert([productData]);
          if (error) throw error;
        }
        
        resetProductForm();
        fetchProducts();
      } catch (error) {
        console.error('Supabase product operation error:', error);
      }
    }
  };

  const resetProductForm = () => {
    setNewProductName('');
    setNewProductDesc('');
    setNewProductIng('');
    setNewProductPrice('');
    setNewProductImage('');
    setNewProductCategory('acai');
    setImageUploadError('');
    setEditingProduct(null);
    setShowAddProductModal(false);
  };

  const openAddProduct = () => {
    resetProductForm();
    setShowAddProductModal(true);
  };

  const openEditProduct = (product: Product) => {
    setEditingProduct(product);
    setNewProductName(product.name);
    setNewProductDesc(product.description);
    setNewProductIng(product.ingredients);
    setNewProductPrice(product.price);
    setNewProductImage(product.image);
    setNewProductCategory(product.category);
    setImageUploadError('');
    setShowAddProductModal(true);
  };

  const deleteProduct = async (id: number) => {
    if (supabase) {
      try {
        const { error } = await supabase.from('products').delete().eq('id', id);
        if (error) throw error;
        fetchProducts();
      } catch (error) {
        console.error('Supabase delete product error:', error);
      }
    }
  };

  const updateProductQuantity = (productId: number, delta: number) => {
    setSelectedOrderProducts(prev => {
      const existing = prev.find(p => p.productId === productId);
      if (existing) {
        const newQty = existing.quantity + delta;
        if (newQty <= 0) {
          return prev.filter(p => p.productId !== productId);
        }
        return prev.map(p => p.productId === productId ? { ...p, quantity: newQty } : p);
      }
      if (delta > 0) {
        return [...prev, { productId, quantity: 1 }];
      }
      return prev;
    });
  };

  const formatPrice = (price: string | number) => {
    if (price === undefined || price === null || price === '') return 'R$ 0,00';
    const s = String(price).trim();
    if (s.startsWith('R$')) return s;
    
    // Remove symbols and spaces
    let clean = s.replace(/[R$\s]/g, '');
    
    // Logic: only remove dots if there's a comma (Brazilian style thousands)
    // OR if there are multiple dots (also likely thousands)
    // If only one dot exists and NO comma, it's likely a decimal separator (US/Standard style)
    const hasComma = clean.includes(',');
    const dotCount = (clean.match(/\./g) || []).length;
    
    if (hasComma || dotCount > 1) {
      clean = clean.replace(/\./g, '').replace(',', '.');
    }
    
    const num = parseFloat(clean);
    if (isNaN(num)) return s;
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(num);
  };

  const calculateTotal = () => {
    return selectedOrderProducts.reduce((acc, item) => {
      const product = products.find(p => p.id === item.productId);
      if (product) {
        let cleanPrice = product.price.replace(/[R$\s]/g, '');
        
        const hasComma = cleanPrice.includes(',');
        const dotCount = (cleanPrice.match(/\./g) || []).length;
        
        if (hasComma || dotCount > 1) {
          cleanPrice = cleanPrice.replace(/\./g, '').replace(',', '.');
        }
        
        const price = parseFloat(cleanPrice);
        return acc + (isNaN(price) ? 0 : price * item.quantity);
      }
      return acc;
    }, 0);
  };

  const renderHome = () => {
    const heroImages = [
      "https://i.ibb.co/tp6F3500/sorvete.jpg",
      "https://i.ibb.co/ksWCr0zV/a-ai.jpg"
    ];

    return (
      <div className="space-y-12 pb-20">
        <section className="relative h-[70vh] flex items-end justify-center overflow-hidden rounded-b-[4rem] shadow-2xl pb-20 bg-pink-950">
          <AnimatePresence initial={false}>
            <motion.img 
              key={heroImageIndex}
              src={heroImages[heroImageIndex]} 
              initial={{ x: '100%', opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: '-100%', opacity: 0 }}
              transition={{ 
                x: { type: "tween", duration: 1.5, ease: [0.4, 0, 0.2, 1] },
                opacity: { duration: 1.2 }
              }}
              className="absolute inset-0 w-full h-full object-cover brightness-30 z-0"
              alt="Mari Açaí Background"
              referrerPolicy="no-referrer"
            />
          </AnimatePresence>

          {/* Carousel Dots */}
          <div className="absolute bottom-10 left-1/2 -translate-x-1/2 z-20 flex gap-2">
            {heroImages.map((_, i) => (
              <button
                key={i}
                onClick={() => setHeroImageIndex(i)}
                className={`w-2 h-2 rounded-full transition-all ${heroImageIndex === i ? 'bg-pink-500 w-6' : 'bg-white/50'}`}
              />
            ))}
          </div>

          <div className="absolute bottom-4 right-8 z-20 text-[10px] text-white/40">
            <a href="https://pt.vecteezy.com/fotos-gratis/sorvetes" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">
              Sorvetes Fotos de banco de imagens por Vecteezy
            </a>
          </div>
          <div className="relative z-10 text-center text-white px-4">
            <motion.h2 
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-5xl md:text-8xl font-black tracking-tighter mb-4 drop-shadow-2xl"
            >
              MARI AÇAÍ
            </motion.h2>
            <motion.p 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="text-lg md:text-2xl font-light tracking-wide max-w-2xl mx-auto drop-shadow-lg"
            >
              Qualidade, Sabor e Refrescância em cada colherada. O melhor açaí e sorvetes artesanais da região.
            </motion.p>
            <motion.button 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.4 }}
              onClick={() => setCurrentPage('products')}
              className="mt-8 bg-pink-600 hover:bg-pink-700 text-white px-8 py-4 rounded-full font-bold text-lg transition-all shadow-xl flex items-center gap-2 mx-auto active:scale-95"
            >
              Ver Cardápio <ChevronRight size={20} />
            </motion.button>
          </div>
        </section>

      <section className="max-w-7xl mx-auto px-6 grid grid-cols-1 md:grid-cols-3 gap-8">
        {[
          { icon: Star, title: 'Qualidade Incomparável', text: 'Ingredientes selecionados para garantir o padrão Mari Açaí.' },
          { icon: Star, title: 'Sabor Irresistível', text: 'Receitas exclusivas que conquistam o paladar desde a primeira vez.' },
          { icon: Clock, title: 'Refrescância Total', text: 'A temperatura ideal para refrescar os seus dias mais quentes.' }
        ].map((feat, i) => (
          <motion.div 
            key={i}
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: i * 0.1 }}
            className="bg-white dark:bg-slate-900 p-8 rounded-3xl shadow-sm border border-pink-50 dark:border-slate-800 text-center transition-colors"
          >
            <div className="bg-pink-100 dark:bg-pink-950/60 w-16 h-16 rounded-2xl flex items-center justify-center text-pink-600 dark:text-pink-400 mx-auto mb-6">
              <feat.icon size={32} />
            </div>
            <h3 className="text-xl font-bold mb-2 text-slate-800 dark:text-slate-100">{feat.title}</h3>
            <p className="text-slate-500 dark:text-slate-400 leading-relaxed">{feat.text}</p>
          </motion.div>
        ))}
      </section>

      {/* Destaques do Cardápio vindos do banco de dados */}
      {products.length > 0 && (
        <section className="max-w-7xl mx-auto px-6 pt-4">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end mb-8 gap-4">
            <div>
              <span className="text-pink-600 dark:text-pink-400 font-bold text-xs uppercase tracking-widest">Cardápio Oficial</span>
              <h3 className="text-3xl md:text-4xl font-black text-slate-800 dark:text-slate-100 tracking-tight">Destaques do Banco de Dados</h3>
            </div>
            <button
              onClick={() => setCurrentPage('products')}
              className="text-pink-600 dark:text-pink-400 font-bold flex items-center gap-1.5 hover:gap-2.5 transition-all text-sm group"
            >
              Ver cardápio completo <ChevronRight size={18} className="group-hover:translate-x-1 transition-transform" />
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {products.slice(0, 4).map((product) => (
              <div 
                key={product.id}
                onClick={() => setSelectedProduct(product)}
                className="bg-white dark:bg-slate-900 rounded-3xl overflow-hidden shadow-sm border border-pink-50 dark:border-slate-800 hover:shadow-xl dark:hover:border-pink-900/50 transition-all group cursor-pointer flex flex-col"
              >
                <div className="h-44 relative overflow-hidden">
                  <ProductImage src={product.image} alt={product.name} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" />
                  <div className="absolute top-3 right-3 bg-white/90 dark:bg-slate-900/90 backdrop-blur-sm px-3 py-1 rounded-full text-pink-600 dark:text-pink-400 font-bold text-xs shadow-sm z-20">
                    {formatPrice(product.price)}
                  </div>
                  <div className="absolute top-3 left-3 bg-pink-600/90 backdrop-blur-sm px-2.5 py-0.5 rounded-full text-[10px] font-bold text-white uppercase tracking-wider z-20">
                    {product.category === 'acai' ? 'Açaí' : 'Sorvete'}
                  </div>
                </div>
                <div className="p-5 flex-1 flex flex-col justify-between">
                  <div>
                    <h4 className="font-bold text-slate-800 dark:text-slate-100 group-hover:text-pink-600 dark:group-hover:text-pink-400 transition-colors mb-1 truncate">{product.name}</h4>
                    <p className="text-slate-500 dark:text-slate-400 text-xs line-clamp-2">{product.description}</p>
                  </div>
                  <span className="text-pink-600 dark:text-pink-400 text-xs font-bold mt-4 block">Ver ingredientes →</span>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
    );
  };

  const renderProducts = () => {
    const filteredProducts = products.filter(p => {
      const matchesCategory = activeCategory === 'all' || p.category === activeCategory;
      const matchesSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                            p.description.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesCategory && matchesSearch;
    });

    return (
      <div className="max-w-7xl mx-auto px-6 py-12 pb-24">
        <div className="text-center mb-12">
          <h2 className="text-4xl font-black text-pink-700 dark:text-pink-400 mb-4">Nosso Cardápio</h2>
          <p className="text-slate-500 dark:text-slate-400 max-w-xl mx-auto">Produtos frescos e preparados na medida certa.</p>
        </div>

        {/* Search Bar */}
        <div className="max-w-md mx-auto mb-8 relative">
          <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
            <Search className="h-5 w-5 text-slate-400 dark:text-slate-500" />
          </div>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar por nome ou descrição..."
            className="w-full pl-11 pr-4 py-3 bg-white dark:bg-slate-900 border border-pink-100 dark:border-slate-800 rounded-full focus:outline-none focus:ring-2 focus:ring-pink-500 focus:border-transparent shadow-sm text-slate-800 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 transition-all"
          />
        </div>

        {/* Category Filter */}
        <div className="flex flex-col sm:flex-row justify-center items-center gap-4 mb-16">
          {[
            { id: 'all', label: 'Todos', icon: ShoppingBag },
            { id: 'acai', label: 'Açaí', icon: AcaiIcon },
            { id: 'sorvete', label: 'Sorvetes', icon: IceCreamIcon },
          ].map((cat) => (
            <button
              key={cat.id}
              onClick={() => setActiveCategory(cat.id as any)}
              className={`flex items-center justify-center gap-2 px-8 py-3 rounded-full font-bold transition-all shadow-sm w-full sm:w-auto ${
                activeCategory === cat.id 
                  ? 'bg-pink-600 text-white shadow-pink-200 dark:shadow-pink-950/50' 
                  : 'bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-300 hover:bg-pink-50 dark:hover:bg-slate-800 hover:text-pink-600 dark:hover:text-pink-400 border border-transparent dark:border-slate-800'
              }`}
            >
              <cat.icon size={18} />
              {cat.label}
            </button>
          ))}
        </div>

        {loadingProducts ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
            {[1, 2, 3, 4].map((n) => (
              <div 
                key={n} 
                className="bg-white dark:bg-slate-900 rounded-[2rem] overflow-hidden shadow-sm border border-pink-50 dark:border-slate-800 p-6 animate-pulse"
              >
                <div className="h-44 bg-slate-200 dark:bg-slate-800 rounded-2xl mb-4" />
                <div className="h-6 bg-slate-200 dark:bg-slate-800 rounded-lg w-3/4 mb-3" />
                <div className="h-4 bg-slate-100 dark:bg-slate-800/60 rounded-lg w-full mb-6" />
                <div className="h-11 bg-pink-100 dark:bg-pink-950/40 rounded-xl w-full" />
              </div>
            ))}
          </div>
        ) : filteredProducts.length === 0 ? (
          <div className="text-center py-16 bg-white dark:bg-slate-900 rounded-[3rem] border border-pink-50 dark:border-slate-800 max-w-xl mx-auto p-8 shadow-sm">
            <div className="bg-pink-100 dark:bg-pink-950/50 w-16 h-16 rounded-2xl flex items-center justify-center text-pink-600 dark:text-pink-400 mx-auto mb-4">
              <ShoppingBag size={28} />
            </div>
            <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100 mb-2">
              {products.length === 0 ? 'Nenhum produto cadastrado no banco' : 'Nenhum produto encontrado'}
            </h3>
            <p className="text-slate-500 dark:text-slate-400 text-sm mb-6 max-w-sm mx-auto">
              {products.length === 0 
                ? 'Os produtos cadastrados no banco de dados aparecerão automaticamente aqui.' 
                : 'Tente alterar os termos da busca ou mudar a categoria selecionada.'}
            </p>
            {products.length > 0 ? (
              <button
                onClick={() => { setActiveCategory('all'); setSearchQuery(''); }}
                className="bg-pink-600 hover:bg-pink-700 text-white px-6 py-2.5 rounded-full font-bold text-sm transition-all shadow-md"
              >
                Limpar filtros
              </button>
            ) : isLoggedIn ? (
              <button
                onClick={() => { setCurrentPage('dashboard'); setDashboardTab('products'); openAddProduct(); }}
                className="bg-pink-600 hover:bg-pink-700 text-white px-6 py-2.5 rounded-full font-bold text-sm transition-all shadow-md"
              >
                Cadastrar primeiro produto
              </button>
            ) : null}
          </div>
        ) : (
          <motion.div 
            layout
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8"
          >
            <AnimatePresence mode="popLayout">
              {filteredProducts.map((product) => (
                <motion.div 
                  key={product.id}
                  layout
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  transition={{ duration: 0.2 }}
                  className="bg-white dark:bg-slate-900 rounded-[2rem] overflow-hidden shadow-sm border border-pink-50 dark:border-slate-800 hover:shadow-xl dark:hover:border-pink-900/50 transition-all group flex flex-col justify-between"
                >
                  <div>
                    <div className="h-48 overflow-hidden relative">
                      <ProductImage 
                        src={product.image} 
                        className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" 
                        alt={product.name}
                      />
                      <div className="absolute top-4 right-4 bg-white/90 dark:bg-slate-900/90 backdrop-blur-sm px-3 py-1 rounded-full text-pink-600 dark:text-pink-400 font-bold text-sm z-20 shadow-sm">
                        {formatPrice(product.price)}
                      </div>
                    </div>
                    <div className="p-6 pb-2">
                      <h3 className="text-xl font-bold mb-2 text-slate-800 dark:text-slate-100 group-hover:text-pink-600 dark:group-hover:text-pink-400 transition-colors">{product.name}</h3>
                      <p className="text-slate-500 dark:text-slate-400 text-sm mb-4 line-clamp-2">{product.description}</p>
                    </div>
                  </div>
                  <div className="p-6 pt-0">
                    <button 
                      onClick={() => setSelectedProduct(product)}
                      className="w-full bg-pink-50 dark:bg-pink-950/40 text-pink-600 dark:text-pink-400 py-3 rounded-xl font-bold hover:bg-pink-600 dark:hover:bg-pink-600 hover:text-white transition-all active:scale-95"
                    >
                      Ingredientes
                    </button>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </motion.div>
        )}

        {/* Ingredients Modal */}
        <AnimatePresence>
          {selectedProduct && (
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-[70]">
              <motion.div 
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="bg-white dark:bg-slate-900 rounded-[3rem] p-10 w-full max-w-md shadow-2xl border border-pink-50 dark:border-slate-800 relative"
              >
                <button 
                  onClick={() => setSelectedProduct(null)}
                  className="absolute top-6 right-6 text-slate-400 dark:text-slate-500 hover:text-pink-600 dark:hover:text-pink-400 transition-colors"
                >
                  <Plus size={24} className="rotate-45" />
                </button>
                
                <div className="bg-pink-100 dark:bg-pink-950/60 w-16 h-16 rounded-2xl flex items-center justify-center text-pink-600 dark:text-pink-400 mb-6">
                  <Star size={32} />
                </div>
                
                <h2 className="text-3xl font-black text-pink-700 dark:text-pink-400 mb-2">{selectedProduct.name}</h2>
                <p className="text-slate-400 dark:text-slate-500 font-medium mb-6 uppercase tracking-widest text-xs">Composição e Ingredientes</p>
                
                <div className="bg-slate-50 dark:bg-slate-800/60 p-6 rounded-2xl border border-slate-100 dark:border-slate-700/60">
                  <p className="text-slate-600 dark:text-slate-300 leading-relaxed italic">
                    "{selectedProduct.ingredients}"
                  </p>
                </div>

                <button
                  onClick={() => setSelectedProduct(null)}
                  className="w-full mt-8 bg-pink-600 text-white py-4 rounded-2xl font-bold hover:bg-pink-700 transition-all shadow-lg shadow-pink-200 dark:shadow-pink-950/50"
                >
                  Fechar
                </button>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
      </div>
    );
  };

  const renderLogin = () => (
    <div className="min-h-[80vh] flex items-center justify-center px-6">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white dark:bg-slate-900 p-10 rounded-[3rem] shadow-2xl w-full max-w-md border border-pink-50 dark:border-slate-800"
      >
        <div className="text-center mb-8">
          <div className="bg-pink-600 w-16 h-16 rounded-2xl flex items-center justify-center text-white mx-auto mb-4 shadow-lg shadow-pink-200 dark:shadow-pink-950/50">
            <LayoutDashboard size={32} />
          </div>
          <h2 className="text-3xl font-black text-slate-800 dark:text-slate-100">
            {authMode === 'login' ? 'Acesso Restrito' : 'Primeiro Acesso'}
          </h2>
          <p className="text-slate-400 dark:text-slate-400 mt-2">
            {authMode === 'login' 
              ? 'Área exclusiva para a equipe Mari Açaí' 
              : 'Crie seu usuário no Supabase para gerenciar a cozinha'}
          </p>
        </div>

        {/* Tab switch */}
        <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-2xl mb-6">
          <button
            type="button"
            onClick={() => { setAuthMode('login'); setLoginError(''); setAuthSuccessMessage(''); }}
            className={`flex-1 py-2 text-sm font-bold rounded-xl transition-all ${authMode === 'login' ? 'bg-white dark:bg-slate-700 text-pink-600 dark:text-pink-400 shadow-sm' : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'}`}
          >
            Entrar
          </button>
          <button
            type="button"
            onClick={() => { setAuthMode('signup'); setLoginError(''); setAuthSuccessMessage(''); }}
            className={`flex-1 py-2 text-sm font-bold rounded-xl transition-all ${authMode === 'signup' ? 'bg-white dark:bg-slate-700 text-pink-600 dark:text-pink-400 shadow-sm' : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'}`}
          >
            Criar Conta
          </button>
        </div>

        <form onSubmit={handleLogin} className="space-y-6">
          <div>
            <label className="block text-sm font-bold text-slate-600 dark:text-slate-300 mb-2 ml-1">E-mail</label>
            <input 
              type="email" 
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-2xl px-6 py-4 focus:ring-2 focus:ring-pink-500 outline-none text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 transition-all"
              placeholder="seu@email.com"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-bold text-slate-600 dark:text-slate-300 mb-2 ml-1">Senha</label>
            <input 
              type="password" 
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-2xl px-6 py-4 focus:ring-2 focus:ring-pink-500 outline-none text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 transition-all"
              placeholder="••••••••"
              required
            />
          </div>
          {authSuccessMessage && (
            <p className="text-emerald-600 dark:text-emerald-400 text-sm text-center font-medium bg-emerald-50 dark:bg-emerald-950/30 p-3 rounded-xl border border-emerald-200 dark:border-emerald-800">
              {authSuccessMessage}
            </p>
          )}
          {loginError && <p className="text-red-500 dark:text-red-400 text-sm text-center font-medium">{loginError}</p>}
          <button 
            type="submit"
            disabled={loggingIn}
            className="w-full bg-pink-600 text-white py-4 rounded-2xl font-bold text-lg hover:bg-pink-700 transition-all shadow-lg shadow-pink-200 dark:shadow-pink-950/50 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {loggingIn ? (
              <>
                <Loader2 className="animate-spin" size={20} />
                {authMode === 'login' ? 'Verificando...' : 'Criando conta...'}
              </>
            ) : (
              authMode === 'login' ? 'Entrar no Painel' : 'Criar Conta'
            )}
          </button>

          <div className="pt-2 text-center">
            <button
              type="button"
              onClick={() => {
                setIsLoggedIn(true);
                setCurrentPage('dashboard');
              }}
              className="text-xs text-slate-400 dark:text-slate-500 hover:text-pink-600 dark:hover:text-pink-400 transition-colors font-medium underline underline-offset-4"
            >
              Acessar Painel em Modo Demonstração (Sem Autenticação)
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );

  const renderDashboard = () => {
    const pendingOrders = orders.filter(o => o.status === 'pending');
    const readyOrders = orders.filter(o => o.status === 'ready');
    const deliveredOrders = orders.filter(o => {
      if (o.status !== 'delivered') return false;
      // Handle both ISO (Supabase) and SQLite date formats
      const orderDate = o.created_at.includes('T') 
        ? o.created_at.split('T')[0] 
        : o.created_at.split(' ')[0];
      return orderDate >= startDate && orderDate <= endDate;
    });

    return (
      <div className="max-w-7xl mx-auto p-4 md:p-6 pb-24">
        {/* Dashboard Header */}
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center mb-8 gap-6">
          <div className="w-full lg:w-auto">
            <h2 className="text-2xl md:text-3xl font-black text-pink-700 dark:text-pink-400 mb-4 lg:mb-0">Painel Administrativo</h2>
            
            {/* Segmented Control Tabs */}
            <div className="bg-slate-100 dark:bg-slate-800/80 p-1 rounded-2xl flex w-full lg:w-fit mt-4 overflow-x-auto no-scrollbar">
              <button 
                onClick={() => setDashboardTab('orders')}
                className={`flex-1 lg:flex-none px-4 md:px-7 py-2.5 rounded-xl font-bold text-sm transition-all whitespace-nowrap shrink-0 ${dashboardTab === 'orders' ? 'bg-white dark:bg-slate-900 text-pink-600 dark:text-pink-400 shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}`}
              >
                Pedidos
              </button>
              <button 
                onClick={() => setDashboardTab('deliveries')}
                className={`flex-1 lg:flex-none px-4 md:px-7 py-2.5 rounded-xl font-bold text-sm transition-all whitespace-nowrap shrink-0 ${dashboardTab === 'deliveries' ? 'bg-white dark:bg-slate-900 text-pink-600 dark:text-pink-400 shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}`}
              >
                Entregas
              </button>
              <button 
                onClick={() => setDashboardTab('products')}
                className={`flex-1 lg:flex-none px-4 md:px-7 py-2.5 rounded-xl font-bold text-sm transition-all whitespace-nowrap shrink-0 ${dashboardTab === 'products' ? 'bg-white dark:bg-slate-900 text-pink-600 dark:text-pink-400 shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}`}
              >
                Produtos
              </button>
              <button 
                onClick={() => setDashboardTab('managerial')}
                className={`flex-1 lg:flex-none px-4 md:px-7 py-2.5 rounded-xl font-bold text-sm transition-all whitespace-nowrap shrink-0 ${dashboardTab === 'managerial' ? 'bg-white dark:bg-slate-900 text-pink-600 dark:text-pink-400 shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}`}
              >
                Gerencial
              </button>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row gap-3 w-full lg:w-auto">
            {dashboardTab === 'orders' && (
              <button 
                onClick={openAddOrder}
                className="flex-1 lg:flex-none bg-pink-600 text-white px-6 py-4 rounded-2xl font-bold flex items-center justify-center gap-2 hover:bg-pink-700 transition-colors shadow-lg shadow-pink-200 dark:shadow-pink-950/50"
              >
                <Plus size={20} /> Novo Pedido
              </button>
            )}
            {dashboardTab === 'products' && (
              <button 
                onClick={openAddProduct}
                className="w-full lg:w-auto bg-pink-600 text-white px-8 py-4 rounded-2xl font-bold flex items-center justify-center gap-2 hover:bg-pink-700 transition-colors shadow-lg shadow-pink-200 dark:shadow-pink-950/50"
              >
                <Plus size={20} /> Novo Produto
              </button>
            )}
          </div>
        </div>

        {dashboardTab === 'orders' ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Pending Column */}
            <section>
              <div className="flex items-center gap-3 mb-6 sticky top-0 bg-[#FDF2F8]/80 dark:bg-slate-950/80 backdrop-blur-sm py-2 z-10">
                <div className="bg-amber-100 dark:bg-amber-950/40 p-2.5 rounded-xl text-amber-600 dark:text-amber-400">
                  <Clock size={20} />
                </div>
                <h3 className="text-lg font-bold text-slate-700 dark:text-slate-200 uppercase tracking-widest">Em Preparo ({pendingOrders.length})</h3>
              </div>
              <div className="space-y-4">
                <AnimatePresence mode="popLayout">
                  {pendingOrders.map((order) => (
                    <motion.div
                      key={order.id}
                      layout
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      className="bg-white dark:bg-slate-900 rounded-[2rem] p-5 md:p-6 shadow-sm border border-pink-50 dark:border-slate-800 flex justify-between items-center group hover:shadow-md transition-all"
                    >
                      <div className="flex-1 pr-4">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-[10px] font-mono bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 px-2 py-0.5 rounded">#ORD-{order.id}</span>
                          <span className="text-[10px] font-bold text-amber-500 uppercase">{new Date(order.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
                        </div>
                        <h4 className="text-lg md:text-xl font-bold text-slate-800 dark:text-slate-100 leading-tight">{order.customer_name}</h4>
                        <p className="text-slate-500 dark:text-slate-400 mt-1 text-sm italic line-clamp-2">"{order.items}"</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => openEditOrder(order)}
                          className="bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 p-3 rounded-2xl hover:bg-pink-100 dark:hover:bg-pink-950/60 hover:text-pink-600 dark:hover:text-pink-400 transition-all active:scale-95"
                          title="Editar Pedido"
                        >
                          <Plus size={18} className="rotate-0" />
                        </button>
                        <button
                          onClick={() => deleteOrder(order.id)}
                          className="bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 p-3 rounded-2xl hover:bg-red-100 dark:hover:bg-red-950/60 hover:text-red-600 dark:hover:text-red-400 transition-all active:scale-95"
                          title="Excluir Pedido"
                        >
                          <Trash2 size={18} />
                        </button>
                        <button
                          onClick={() => markAsReady(order.id)}
                          className="bg-pink-100 dark:bg-pink-950/60 text-pink-600 dark:text-pink-400 p-5 rounded-2xl hover:bg-pink-600 hover:text-white transition-all shadow-sm active:scale-95"
                          title="Marcar como Pronto"
                        >
                          <Bell size={24} />
                        </button>
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
                {pendingOrders.length === 0 && (
                  <div className="py-12 text-center bg-white/50 dark:bg-slate-900/40 rounded-[2rem] border border-dashed border-slate-200 dark:border-slate-800">
                    <p className="text-slate-400 dark:text-slate-500 font-medium">Nenhum pedido em preparo</p>
                  </div>
                )}
              </div>
            </section>

            {/* Ready Column */}
            <section>
              <div className="flex items-center gap-3 mb-6 sticky top-0 bg-[#FDF2F8]/80 dark:bg-slate-950/80 backdrop-blur-sm py-2 z-10">
                <div className="bg-emerald-100 dark:bg-emerald-950/40 p-2.5 rounded-xl text-emerald-600 dark:text-emerald-400">
                  <CheckCircle size={20} />
                </div>
                <h3 className="text-lg font-bold text-slate-700 dark:text-slate-200 uppercase tracking-widest">Prontos ({readyOrders.length})</h3>
              </div>
              <div className="space-y-4">
                <AnimatePresence mode="popLayout">
                  {readyOrders.map((order) => (
                    <motion.div
                      key={order.id}
                      layout
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      className="bg-emerald-50/50 dark:bg-emerald-950/20 rounded-[2rem] p-5 md:p-6 shadow-sm border border-emerald-100 dark:border-emerald-900/40 flex justify-between items-center group hover:shadow-md transition-all"
                    >
                      <div className="flex-1 pr-4">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-[10px] font-mono bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400 px-2 py-0.5 rounded">#ORD-{order.id}</span>
                          <span className="text-[10px] font-bold text-emerald-500 uppercase">Pronto</span>
                        </div>
                        <h4 className="text-lg md:text-xl font-bold text-emerald-900 dark:text-emerald-200 leading-tight">{order.customer_name}</h4>
                        <p className="text-emerald-700/70 dark:text-emerald-400/80 mt-1 text-sm italic line-clamp-2">"{order.items}"</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => openEditOrder(order)}
                          className="bg-white/50 dark:bg-slate-800/80 text-emerald-600 dark:text-emerald-400 p-3 rounded-2xl hover:bg-emerald-600 hover:text-white transition-all active:scale-95"
                          title="Editar Pedido"
                        >
                          <Plus size={18} className="rotate-0" />
                        </button>
                        <button
                          onClick={() => deleteOrder(order.id)}
                          className="bg-white/50 dark:bg-slate-800/80 text-red-500 dark:text-red-400 p-3 rounded-2xl hover:bg-red-500 hover:text-white transition-all active:scale-95"
                          title="Excluir Pedido"
                        >
                          <Trash2 size={18} />
                        </button>
                        <button
                          onClick={() => markAsDelivered(order.id)}
                          className="bg-emerald-600 text-white p-5 rounded-2xl hover:bg-emerald-700 transition-all shadow-md active:scale-95"
                          title="Marcar como Entregue"
                        >
                          <CheckCircle size={24} />
                        </button>
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
                {readyOrders.length === 0 && (
                  <div className="py-12 text-center bg-emerald-50/30 dark:bg-emerald-950/10 rounded-[2rem] border border-dashed border-emerald-100 dark:border-emerald-900/30">
                    <p className="text-emerald-400 dark:text-emerald-500 font-medium">Nenhum pedido pronto para entrega</p>
                  </div>
                )}
              </div>
            </section>
          </div>
        ) : dashboardTab === 'deliveries' ? (
          <div className="space-y-8">
            {/* Date Filter Bar */}
            <div className="bg-white dark:bg-slate-900 p-5 md:p-6 rounded-[2rem] shadow-sm border border-pink-50 dark:border-slate-800 flex flex-col sm:flex-row gap-4 items-stretch sm:items-end">
              <div className="flex-1">
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 ml-1">Data Início</label>
                <div className="relative">
                  <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 text-pink-400" size={18} />
                  <input 
                    type="date" 
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-2xl pl-12 pr-4 py-3.5 outline-none focus:ring-2 focus:ring-pink-500 transition-all font-bold text-slate-600 dark:text-slate-200 text-sm"
                  />
                </div>
              </div>
              <div className="flex-1">
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 ml-1">Data Fim</label>
                <div className="relative">
                  <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 text-pink-400" size={18} />
                  <input 
                    type="date" 
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-2xl pl-12 pr-4 py-3.5 outline-none focus:ring-2 focus:ring-pink-500 transition-all font-bold text-slate-600 dark:text-slate-200 text-sm"
                  />
                </div>
              </div>
              <button className="bg-pink-600 text-white px-8 py-3.5 rounded-2xl font-bold flex items-center justify-center gap-2 hover:bg-pink-700 transition-all shadow-lg shadow-pink-100 dark:shadow-none active:scale-95">
                <Search size={18} /> <span className="sm:hidden lg:inline">Filtrar</span>
              </button>
            </div>

            {/* Deliveries Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
              <AnimatePresence mode="popLayout">
                {deliveredOrders.length > 0 ? (
                  deliveredOrders.map((order) => (
                    <motion.div
                      key={order.id}
                      layout
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      className="bg-white dark:bg-slate-900 rounded-[2rem] p-6 shadow-sm border border-slate-100 dark:border-slate-800 flex flex-col gap-4 hover:shadow-md transition-all"
                    >
                      <div className="flex justify-between items-start">
                        <div>
                          <span className="text-[10px] font-mono bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 px-2 py-0.5 rounded">#ORD-{order.id}</span>
                          <h4 className="text-xl font-bold text-slate-800 dark:text-slate-100 mt-1">{order.customer_name}</h4>
                        </div>
                        <div className="bg-emerald-100 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest">
                          Entregue
                        </div>
                      </div>
                      <p className="text-slate-500 dark:text-slate-400 text-sm italic line-clamp-3">"{order.items}"</p>
                      <div className="mt-auto pt-4 border-t border-slate-50 dark:border-slate-800 flex justify-between items-center">
                        <div className="flex flex-col">
                          <span className="text-[10px] font-bold text-slate-300 dark:text-slate-500 uppercase tracking-widest">Data</span>
                          <span className="text-xs font-bold text-slate-500 dark:text-slate-400">{new Date(order.created_at).toLocaleDateString('pt-BR')}</span>
                        </div>
                        <div className="flex flex-col items-end">
                          <span className="text-[10px] font-bold text-slate-300 dark:text-slate-500 uppercase tracking-widest">Hora</span>
                          <span className="text-xs font-bold text-slate-500 dark:text-slate-400">{new Date(order.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
                        </div>
                      </div>
                    </motion.div>
                  ))
                ) : (
                  <div className="col-span-full py-20 text-center bg-white/50 dark:bg-slate-900/50 rounded-[3rem] border border-dashed border-slate-200 dark:border-slate-800">
                    <div className="bg-slate-100 dark:bg-slate-800 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 text-slate-400">
                      <Search size={32} />
                    </div>
                    <p className="text-slate-400 dark:text-slate-500 font-bold">Nenhuma entrega encontrada para este período.</p>
                  </div>
                )}
              </AnimatePresence>
            </div>
          </div>
        ) : dashboardTab === 'products' ? (
          <div className="space-y-6">
            {/* Search Bar for Dashboard Products */}
            <div className="max-w-md relative">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                <Search className="h-5 w-5 text-slate-400 dark:text-slate-500" />
              </div>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar produtos..."
                className="w-full pl-11 pr-4 py-3 bg-white dark:bg-slate-900 border border-pink-100 dark:border-slate-800 rounded-full focus:outline-none focus:ring-2 focus:ring-pink-500 focus:border-transparent shadow-sm text-slate-800 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 transition-all"
              />
            </div>
            
            {loadingProducts ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {[1, 2, 3].map((n) => (
                  <div key={n} className="bg-white dark:bg-slate-900 rounded-[2.5rem] p-6 border border-pink-50 dark:border-slate-800 animate-pulse">
                    <div className="h-44 bg-slate-200 dark:bg-slate-800 rounded-2xl mb-4" />
                    <div className="h-6 bg-slate-200 dark:bg-slate-800 rounded-lg w-2/3 mb-2" />
                    <div className="h-4 bg-slate-100 dark:bg-slate-800/60 rounded-lg w-full mb-6" />
                    <div className="h-10 bg-slate-100 dark:bg-slate-800/60 rounded-2xl" />
                  </div>
                ))}
              </div>
            ) : products.length === 0 ? (
              <div className="text-center py-16 bg-white dark:bg-slate-900 rounded-[2.5rem] border border-pink-50 dark:border-slate-800 p-8 shadow-sm">
                <div className="bg-pink-100 dark:bg-pink-950/50 w-16 h-16 rounded-2xl flex items-center justify-center text-pink-600 dark:text-pink-400 mx-auto mb-4">
                  <Package size={28} />
                </div>
                <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100 mb-2">Nenhum produto cadastrado no banco</h3>
                <p className="text-slate-500 dark:text-slate-400 text-sm mb-6 max-w-sm mx-auto">Cadastre produtos no banco de dados para que apareçam no cardápio e no sistema.</p>
                <button
                  onClick={openAddProduct}
                  className="bg-pink-600 hover:bg-pink-700 text-white px-6 py-3 rounded-2xl font-bold text-sm transition-all shadow-md shadow-pink-200 dark:shadow-none"
                >
                  Cadastrar Primeiro Produto
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {products
                  .filter(p => p.name.toLowerCase().includes(searchQuery.toLowerCase()) || p.description.toLowerCase().includes(searchQuery.toLowerCase()))
                  .map((product) => (
                <motion.div 
                  key={product.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-white dark:bg-slate-900 rounded-[2.5rem] overflow-hidden shadow-sm border border-pink-50 dark:border-slate-800 flex flex-col group hover:shadow-xl dark:hover:border-pink-900/50 transition-all duration-500"
                >
                  <div className="h-48 relative overflow-hidden">
                    <ProductImage src={product.image} alt={product.name} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" />
                    <div className="absolute top-4 right-4 bg-white/90 dark:bg-slate-900/90 backdrop-blur-sm px-4 py-1.5 rounded-full text-sm font-black text-pink-600 dark:text-pink-400 shadow-sm z-20">
                      {formatPrice(product.price)}
                    </div>
                    <div className="absolute top-4 left-4 bg-pink-600/90 backdrop-blur-sm px-3 py-1 rounded-full text-[10px] font-bold text-white uppercase tracking-widest flex items-center gap-1.5 z-20">
                      {product.category === 'acai' ? (
                        <>
                          <AcaiIcon className="w-3 h-3" />
                          Açaí
                        </>
                      ) : (
                        <>
                          <IceCreamIcon className="w-3 h-3" />
                          Sorvete
                        </>
                      )}
                    </div>
                  </div>
                  <div className="p-6 flex-1 flex flex-col">
                    <h4 className="text-xl font-bold text-slate-800 dark:text-slate-100 mb-2">{product.name}</h4>
                    <p className="text-slate-500 dark:text-slate-400 text-sm line-clamp-2 mb-6 flex-1">{product.description}</p>
                    <div className="flex gap-2">
                      <button 
                        onClick={() => openEditProduct(product)}
                        className="flex-1 bg-pink-50 dark:bg-pink-950/40 text-pink-600 dark:text-pink-400 py-3 rounded-2xl font-bold hover:bg-pink-600 dark:hover:bg-pink-600 hover:text-white transition-all flex items-center justify-center gap-2 active:scale-95"
                      >
                        Editar
                      </button>
                      <button 
                        onClick={() => deleteProduct(product.id)}
                        className="bg-red-50 dark:bg-red-950/40 text-red-500 dark:text-red-400 p-3 rounded-2xl font-bold hover:bg-red-500 dark:hover:bg-red-500 hover:text-white transition-all flex items-center justify-center active:scale-95"
                        title="Excluir"
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  </div>
                </motion.div>
              ))}
              </div>
            )}
          </div>
        ) : dashboardTab === 'managerial' ? (
          <ManagerialDashboard
            orders={[...orders, ...sampleOrders]}
            products={products.length > 0 ? products : sampleCatalog}
            sensorEntries={sensorEntries}
            lastSensorSignalAt={lastSensorSignalAt}
            onSimulateSensorPass={simulateSensorPass}
            onGenerateSampleHistory={generateSampleHistory}
            onClearSampleHistory={clearSampleHistory}
            hasSampleData={sampleOrders.length > 0 || sensorEntries.some(e => e.source === 'sample')}
            generatingSample={generatingSample}
          />
        ) : null}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-[#FDF2F8] dark:bg-slate-950 font-sans text-slate-900 dark:text-slate-100 selection:bg-pink-200 selection:text-pink-900 transition-colors duration-300">
      {/* Navigation */}
      <div 
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 flex justify-center items-start pt-3 sm:pt-4 md:pt-6 pointer-events-none`}
        style={scrolled ? {
          height: '100px',
          background: 'rgba(255, 255, 255, 0)',
          boxShadow: theme === 'dark' ? '0 4px 30px rgba(0, 0, 0, 0.4)' : '0 4px 30px rgba(0, 0, 0, 0.08)',
          backdropFilter: 'blur(13.7px)',
          WebkitBackdropFilter: 'blur(13.7px)',
        } : { height: '0px' }}
      >
        <nav className={`pointer-events-auto transition-all duration-500 
          w-[96%] max-w-5xl sm:w-auto flex items-center justify-between sm:justify-start gap-1 sm:gap-4 md:gap-6 px-3 sm:px-6 py-2.5 sm:py-3.5 rounded-full shadow-2xl border
          ${scrolled 
            ? 'bg-white/40 dark:bg-slate-900/60 border-white/20 dark:border-slate-800/60 backdrop-blur-md' 
            : 'bg-white/80 dark:bg-slate-900/90 backdrop-blur-xl border-pink-100 dark:border-slate-800'
          }`}>
          <div 
            onClick={() => setCurrentPage('home')}
            className="flex items-center gap-2 cursor-pointer group shrink-0"
          >
            <div className="bg-pink-600 p-1.5 rounded-lg text-white group-hover:rotate-12 transition-transform">
              <Package size={18} />
            </div>
            <div className="flex flex-col">
              <span className="font-black text-pink-700 dark:text-pink-400 tracking-tighter text-sm sm:text-base md:text-lg leading-none">MARI AÇAÍ</span>
              <div className="flex items-center gap-1 mt-0.5">
                <div className={`w-1 h-1 rounded-full ${
                  supabaseStatus === 'connected' ? 'bg-emerald-500 animate-pulse' : 
                  supabaseStatus === 'error' ? 'bg-red-500' : 'bg-slate-300 dark:bg-slate-600'
                }`} />
                <span className="text-[8px] font-bold text-slate-400 uppercase tracking-widest hidden xs:inline">
                  {supabaseStatus === 'connected' ? 'Supabase Online' : 
                   supabaseStatus === 'error' ? 'Supabase Error' : 'Local Mode'}
                </span>
              </div>
            </div>
          </div>
          
          <div className="h-6 w-px bg-pink-100 dark:bg-slate-800 hidden sm:block" />
          
          <div className="flex items-center gap-1 sm:gap-2 md:gap-4">
            <button 
              onClick={() => setCurrentPage('home')}
              className={`flex items-center gap-1.5 sm:gap-2 font-bold text-xs sm:text-sm transition-all px-2.5 sm:px-3 py-1.5 rounded-full ${currentPage === 'home' ? 'text-pink-600 bg-pink-50 dark:bg-pink-950/60 dark:text-pink-300' : 'text-slate-500 dark:text-slate-400 hover:text-pink-500 dark:hover:text-pink-300'}`}
            >
              <HomeIcon size={16} className="sm:w-[18px] sm:h-[18px]" /> <span className="hidden sm:inline">Início</span>
            </button>
            <button 
              onClick={() => setCurrentPage('products')}
              className={`flex items-center gap-1.5 sm:gap-2 font-bold text-xs sm:text-sm transition-all px-2.5 sm:px-3 py-1.5 rounded-full ${currentPage === 'products' ? 'text-pink-600 bg-pink-50 dark:bg-pink-950/60 dark:text-pink-300' : 'text-slate-500 dark:text-slate-400 hover:text-pink-500 dark:hover:text-pink-300'}`}
            >
              <ShoppingBag size={16} className="sm:w-[18px] sm:h-[18px]" /> <span className="hidden sm:inline">Produtos</span>
            </button>
            {isLoggedIn ? (
              <>
                <button 
                  onClick={() => setCurrentPage('dashboard')}
                  className={`flex items-center gap-1.5 sm:gap-2 font-bold text-xs sm:text-sm transition-all px-2.5 sm:px-3 py-1.5 rounded-full ${currentPage === 'dashboard' ? 'text-pink-600 bg-pink-50 dark:bg-pink-950/60 dark:text-pink-300' : 'text-slate-500 dark:text-slate-400 hover:text-pink-500 dark:hover:text-pink-300'}`}
                >
                  <LayoutDashboard size={16} className="sm:w-[18px] sm:h-[18px]" /> <span className="hidden sm:inline">Painel</span>
                </button>
                <button 
                  onClick={handleLogout}
                  className="flex items-center gap-1.5 sm:gap-2 font-bold text-xs sm:text-sm text-slate-400 dark:text-slate-400 hover:text-red-500 dark:hover:text-red-400 transition-all px-2 sm:px-3 py-1.5 rounded-full"
                >
                  <LogOut size={16} className="sm:w-[18px] sm:h-[18px]" /> <span className="hidden sm:inline">Sair</span>
                </button>
              </>
            ) : (
              <button 
                onClick={() => setCurrentPage('login')}
                className={`flex items-center gap-1.5 sm:gap-2 font-bold text-xs sm:text-sm transition-all px-2.5 sm:px-3 py-1.5 rounded-full ${currentPage === 'login' ? 'text-pink-600 bg-pink-50 dark:bg-pink-950/60 dark:text-pink-300' : 'text-slate-500 dark:text-slate-400 hover:text-pink-500 dark:hover:text-pink-300'}`}
              >
                <LogIn size={16} className="sm:w-[18px] sm:h-[18px]" /> <span className="hidden sm:inline">Admin</span>
              </button>
            )}

            <div className="h-5 w-px bg-pink-100 dark:bg-slate-800" />

            {/* Theme Toggle Button */}
            <button 
              type="button"
              onClick={toggleTheme}
              className="flex items-center justify-center gap-1.5 p-1.5 sm:px-3 sm:py-1.5 rounded-full text-slate-600 dark:text-slate-300 hover:bg-pink-50 dark:hover:bg-slate-800 transition-all active:scale-95 border border-transparent dark:border-slate-800"
              title={theme === 'dark' ? 'Alternar para tema claro' : 'Alternar para tema escuro'}
              aria-label={theme === 'dark' ? 'Alternar para tema claro' : 'Alternar para tema escuro'}
            >
              {theme === 'dark' ? (
                <>
                  <Sun size={17} className="text-amber-400 transition-transform duration-300 rotate-0 hover:rotate-90" />
                  <span className="hidden md:inline text-xs font-bold text-slate-200">Claro</span>
                </>
              ) : (
                <>
                  <Moon size={17} className="text-pink-700 transition-transform duration-300 hover:-rotate-12" />
                  <span className="hidden md:inline text-xs font-bold text-slate-700">Escuro</span>
                </>
              )}
            </button>
          </div>
        </nav>
      </div>

      {/* Content */}
      <AnimatePresence mode="wait">
        <motion.div
          key={currentPage}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.3 }}
          className="pt-24"
        >
          {currentPage === 'home' && renderHome()}
          {currentPage === 'products' && renderProducts()}
          {currentPage === 'login' && renderLogin()}
          {currentPage === 'dashboard' && (isLoggedIn ? renderDashboard() : renderLogin())}
        </motion.div>
      </AnimatePresence>

      {/* Add Product Modal */}
      <AnimatePresence>
        {showAddProductModal && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-[60]">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="bg-white dark:bg-slate-900 rounded-[3rem] p-6 sm:p-10 w-full max-w-2xl shadow-2xl border border-pink-50 dark:border-slate-800 max-h-[90vh] overflow-y-auto no-scrollbar"
            >
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-3xl font-black text-pink-600 dark:text-pink-400">{editingProduct ? 'Editar Produto' : 'Novo Produto'}</h2>
                <button onClick={resetProductForm} className="text-slate-400 dark:text-slate-500 hover:text-pink-600 dark:hover:text-pink-400">
                  <Plus size={24} className="rotate-45" />
                </button>
              </div>
              <form onSubmit={createProduct} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-bold text-slate-600 dark:text-slate-300 mb-2 ml-1">Nome do Produto</label>
                    <input
                      required
                      type="text"
                      value={newProductName}
                      onChange={(e) => setNewProductName(e.target.value)}
                      className="w-full bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-2xl px-6 py-4 focus:ring-2 focus:ring-pink-500 outline-none text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 transition-all"
                      placeholder="Ex: Açaí com Nutella"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-slate-600 dark:text-slate-300 mb-2 ml-1">Preço</label>
                    <input
                      required
                      type="text"
                      value={newProductPrice}
                      onChange={(e) => setNewProductPrice(e.target.value)}
                      className="w-full bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-2xl px-6 py-4 focus:ring-2 focus:ring-pink-500 outline-none text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 transition-all"
                      placeholder="Ex: R$ 22,00"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-600 dark:text-slate-300 mb-2 ml-1">Categoria</label>
                  <div className="grid grid-cols-2 gap-4">
                    <button
                      type="button"
                      onClick={() => setNewProductCategory('acai')}
                      className={`flex items-center justify-center gap-3 py-4 rounded-2xl font-bold border-2 transition-all ${
                        newProductCategory === 'acai' 
                          ? 'border-pink-600 bg-pink-50 dark:bg-pink-950/60 text-pink-600 dark:text-pink-400' 
                          : 'border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 text-slate-400 dark:text-slate-400 hover:border-pink-200 dark:hover:border-slate-700'
                      }`}
                    >
                      <AcaiIcon className="w-6 h-6" />
                      Açaí
                    </button>
                    <button
                      type="button"
                      onClick={() => setNewProductCategory('sorvete')}
                      className={`flex items-center justify-center gap-3 py-4 rounded-2xl font-bold border-2 transition-all ${
                        newProductCategory === 'sorvete' 
                          ? 'border-pink-600 bg-pink-50 dark:bg-pink-950/60 text-pink-600 dark:text-pink-400' 
                          : 'border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 text-slate-400 dark:text-slate-400 hover:border-pink-200 dark:hover:border-slate-700'
                      }`}
                    >
                      <IceCreamIcon className="w-6 h-6" />
                      Sorvete
                    </button>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-600 dark:text-slate-300 mb-2 ml-1">Descrição Curta</label>
                  <textarea
                    required
                    value={newProductDesc}
                    onChange={(e) => setNewProductDesc(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-2xl px-6 py-4 focus:ring-2 focus:ring-pink-500 outline-none text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 transition-all h-24 resize-none"
                    placeholder="Descreva o sabor..."
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-600 dark:text-slate-300 mb-2 ml-1">Ingredientes (Separados por vírgula)</label>
                  <textarea
                    required
                    value={newProductIng}
                    onChange={(e) => setNewProductIng(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-2xl px-6 py-4 focus:ring-2 focus:ring-pink-500 outline-none text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 transition-all h-24 resize-none"
                    placeholder="Ex: Açaí, Nutella, Leite em pó..."
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-600 dark:text-slate-300 mb-2 ml-1">Imagem do Produto</label>
                  <div className="space-y-4">
                    <div className="flex gap-4">
                      <input
                        type="text"
                        value={newProductImage}
                        onChange={(e) => setNewProductImage(e.target.value)}
                        className="flex-1 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-2xl px-6 py-4 focus:ring-2 focus:ring-pink-500 outline-none text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 transition-all"
                        placeholder="URL da imagem ou carregue um arquivo"
                      />
                      <input
                        type="file"
                        ref={fileInputRef}
                        onChange={handleImageUpload}
                        accept="image/*"
                        className="hidden"
                      />
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={uploading}
                        className="bg-pink-50 dark:bg-pink-950/40 text-pink-600 dark:text-pink-400 px-6 rounded-2xl font-bold border-2 border-pink-100 dark:border-pink-900/60 hover:border-pink-600 dark:hover:border-pink-400 transition-all flex items-center gap-2 disabled:opacity-50 whitespace-nowrap"
                      >
                        {uploading ? (
                          <Loader2 className="w-5 h-5 animate-spin" />
                        ) : (
                          <Upload className="w-5 h-5" />
                        )}
                        {uploading ? 'Enviando...' : 'Upload'}
                      </button>
                    </div>
                    {imageUploadError && (
                      <p className="text-red-500 text-xs font-semibold">{imageUploadError}</p>
                    )}
                    {newProductImage && (
                      <div className="relative w-full h-40 rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800">
                        <ProductImage 
                          src={newProductImage} 
                          alt="Preview" 
                          className="w-full h-full object-cover"
                        />
                        <button
                          type="button"
                          onClick={() => setNewProductImage('')}
                          className="absolute top-2 right-2 bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm p-1.5 rounded-full text-pink-600 dark:text-pink-400 hover:bg-pink-600 hover:text-white transition-all shadow-sm"
                        >
                          <Plus size={16} className="rotate-45" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
                <button 
                  type="submit"
                  disabled={uploading}
                  className="w-full bg-pink-600 text-white py-5 rounded-2xl font-bold text-lg hover:bg-pink-700 transition-all shadow-lg shadow-pink-200 dark:shadow-pink-950/50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {uploading ? 'Aguarde o upload...' : (editingProduct ? 'Salvar Alterações' : 'Cadastrar Produto')}
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {showAddModal && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-[60]">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="bg-white dark:bg-slate-900 rounded-[3rem] p-6 sm:p-10 w-full max-w-2xl shadow-2xl border border-pink-50 dark:border-slate-800 max-h-[90vh] overflow-y-auto no-scrollbar"
            >
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-3xl font-black text-pink-600 dark:text-pink-400">{editingOrder ? 'Editar Pedido' : 'Novo Pedido'}</h2>
                <button onClick={resetOrderForm} className="text-slate-400 dark:text-slate-500 hover:text-pink-600 dark:hover:text-pink-400">
                  <Plus size={24} className="rotate-45" />
                </button>
              </div>
              
              <form onSubmit={createOrder} className="space-y-8">
                <div>
                  <label className="block text-sm font-bold text-slate-600 dark:text-slate-300 mb-2 ml-1">Nome do Cliente</label>
                  <input
                    required
                    type="text"
                    value={newOrderName}
                    onChange={(e) => setNewOrderName(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-2xl px-6 py-4 focus:ring-2 focus:ring-pink-500 outline-none text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 transition-all"
                    placeholder="Ex: João Silva"
                  />
                </div>

                <div>
                  <label className="block text-sm font-bold text-slate-600 dark:text-slate-300 mb-4 ml-1">Selecione os Produtos</label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-h-60 overflow-y-auto pr-2 no-scrollbar">
                    {products.length === 0 ? (
                      <div className="col-span-2 text-center py-6 px-4 bg-slate-50 dark:bg-slate-800/40 rounded-2xl border border-dashed border-slate-200 dark:border-slate-700">
                        <p className="text-sm text-slate-500 dark:text-slate-400">
                          Nenhum produto cadastrado no banco de dados.
                        </p>
                        <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                          Você pode descrever os itens manualmente no campo de observações abaixo.
                        </p>
                      </div>
                    ) : (
                      products.map(product => {
                        const selected = selectedOrderProducts.find(p => p.productId === product.id);
                        return (
                          <div key={product.id} className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-800/60 rounded-2xl border border-slate-100 dark:border-slate-700/60">
                            <div className="flex items-center gap-3 flex-1">
                              <div className="bg-white dark:bg-slate-700 p-2 rounded-xl text-pink-500 dark:text-pink-400 shadow-sm">
                                {product.category === 'acai' ? <AcaiIcon className="w-4 h-4" /> : <IceCreamIcon className="w-4 h-4" />}
                              </div>
                              <div>
                                <p className="font-bold text-slate-700 dark:text-slate-200 text-sm">{product.name}</p>
                                <p className="text-pink-600 dark:text-pink-400 text-xs font-bold">{formatPrice(product.price)}</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-3">
                              <button
                                type="button"
                                onClick={() => updateProductQuantity(product.id, -1)}
                                className="w-8 h-8 rounded-full bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 flex items-center justify-center text-slate-400 dark:text-slate-300 hover:bg-pink-50 dark:hover:bg-slate-600 hover:text-pink-600 dark:hover:text-pink-300 transition-all"
                              >
                                -
                              </button>
                              <span className="font-bold text-slate-700 dark:text-slate-200 w-4 text-center">{selected?.quantity || 0}</span>
                              <button
                                type="button"
                                onClick={() => updateProductQuantity(product.id, 1)}
                                className="w-8 h-8 rounded-full bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 flex items-center justify-center text-slate-400 dark:text-slate-300 hover:bg-pink-50 dark:hover:bg-slate-600 hover:text-pink-600 dark:hover:text-pink-300 transition-all"
                              >
                                +
                              </button>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>

                <div className="bg-pink-50 dark:bg-pink-950/40 p-6 rounded-[2rem] border border-pink-100 dark:border-pink-900/50">
                  <div className="flex justify-between items-center">
                    <div>
                      <p className="text-pink-600 dark:text-pink-400 text-xs font-bold uppercase tracking-widest">Total do Pedido</p>
                      <h3 className="text-3xl font-black text-pink-700 dark:text-pink-300">
                        R$ {calculateTotal().toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </h3>
                    </div>
                    <div className="text-right">
                      <p className="text-slate-400 dark:text-slate-400 text-[10px] uppercase font-bold">Itens Selecionados</p>
                      <p className="text-pink-600 dark:text-pink-400 font-bold">
                        {selectedOrderProducts.reduce((acc, curr) => acc + curr.quantity, 0)} un.
                      </p>
                    </div>
                  </div>
                </div>

                {orderFormError && (
                  <p className="text-red-500 text-sm font-semibold text-center">{orderFormError}</p>
                )}

                <div className="flex gap-4 pt-2">
                  <button
                    type="button"
                    onClick={resetOrderForm}
                    className="flex-1 px-6 py-4 rounded-2xl font-bold text-slate-400 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="flex-1 bg-pink-600 text-white px-6 py-4 rounded-2xl font-bold hover:bg-pink-700 transition-all shadow-lg shadow-pink-200 dark:shadow-pink-950/50"
                  >
                    {editingOrder ? 'Salvar Alterações' : 'Finalizar Pedido'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Main Footer */}
      <footer className="bg-white dark:bg-slate-900 border-t border-pink-100 dark:border-slate-800 pt-16 pb-24 mt-20 transition-colors">
        <div className="max-w-7xl mx-auto px-6 grid grid-cols-1 md:grid-cols-3 gap-12">
          {/* Brand & Social */}
          <div className="space-y-6">
            <div className="flex items-center gap-2">
              <div className="bg-pink-600 p-1.5 rounded-lg text-white">
                <Package size={24} />
              </div>
              <span className="font-black text-pink-700 dark:text-pink-400 tracking-tighter text-2xl">MARI AÇAÍ</span>
            </div>
            <p className="text-slate-500 dark:text-slate-400 leading-relaxed">
              Levando a qualidade, o sabor e a refrescância do melhor açaí da região diretamente para você.
            </p>
            <div className="flex gap-4">
              <a href="#" className="bg-pink-50 dark:bg-slate-800 p-3 rounded-2xl text-pink-600 dark:text-pink-400 hover:bg-pink-600 dark:hover:bg-pink-600 hover:text-white transition-all shadow-sm">
                <Instagram size={20} />
              </a>
              <a href="#" className="bg-pink-50 dark:bg-slate-800 p-3 rounded-2xl text-pink-600 dark:text-pink-400 hover:bg-pink-600 dark:hover:bg-pink-600 hover:text-white transition-all shadow-sm">
                <Facebook size={20} />
              </a>
              <a href="#" className="bg-pink-50 dark:bg-slate-800 p-3 rounded-2xl text-pink-600 dark:text-pink-400 hover:bg-pink-600 dark:hover:bg-pink-600 hover:text-white transition-all shadow-sm">
                <MessageCircle size={20} />
              </a>
            </div>
          </div>

          {/* Address */}
          <div className="space-y-6">
            <h4 className="text-lg font-bold text-slate-800 dark:text-slate-200 uppercase tracking-widest">Onde Estamos</h4>
            <div className="flex gap-4 items-start">
              <div className="bg-pink-100 dark:bg-pink-950/60 p-3 rounded-2xl text-pink-600 dark:text-pink-400">
                <MapPin size={20} />
              </div>
              <div>
                <p className="font-bold text-slate-700 dark:text-slate-200">Mari Açaí - Matriz</p>
                <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">
                  Rua das Palmeiras, 123<br />
                  Bairro Tropical - Cidade do Açaí<br />
                  CEP: 12345-678
                </p>
              </div>
            </div>
          </div>

          {/* Hours */}
          <div className="space-y-6">
            <h4 className="text-lg font-bold text-slate-800 dark:text-slate-200 uppercase tracking-widest">Horário</h4>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-slate-400 dark:text-slate-400">Segunda - Sexta</span>
                <span className="font-bold text-slate-700 dark:text-slate-200">14:00 - 22:00</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-400 dark:text-slate-400">Sábado - Domingo</span>
                <span className="font-bold text-slate-700 dark:text-slate-200">12:00 - 23:00</span>
              </div>
            </div>
          </div>
        </div>
        
        <div className="max-w-7xl mx-auto px-6 mt-16 pt-8 border-t border-slate-100 dark:border-slate-800 text-center flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-slate-400 dark:text-slate-500 text-xs">
            © {new Date().getFullYear()} Mari Açaí. Todos os direitos reservados.
          </p>
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400 dark:text-slate-500">Tema atual:</span>
            <button
              onClick={toggleTheme}
              className="text-xs font-bold text-pink-600 dark:text-pink-400 hover:underline flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-pink-50 dark:bg-slate-800"
            >
              {theme === 'dark' ? (
                <>
                  <Sun size={13} className="text-amber-400" />
                  <span>Modo Escuro (Mudar para Claro)</span>
                </>
              ) : (
                <>
                  <Moon size={13} className="text-pink-600" />
                  <span>Modo Claro (Mudar para Escuro)</span>
                </>
              )}
            </button>
          </div>
        </div>
      </footer>

      {/* ESP32 Info Footer (Only on Dashboard) */}
      {currentPage === 'dashboard' && isLoggedIn && (
        <footer className="fixed bottom-0 left-0 right-0 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-t border-pink-100 dark:border-slate-800 p-3 text-center z-40">
          <p className="text-[10px] text-slate-400 uppercase tracking-widest font-mono">
            ESP32 Sensor Endpoint: <span className="text-pink-500 dark:text-pink-400 font-bold">{window.location.origin}/api/esp32/led</span>
          </p>
        </footer>
      )}
    </div>
  );
}
