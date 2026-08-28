import carroPng from '../assets/carro-totem.png';

export function CenaCarro3D() {
  return (
    <img 
      src={carroPng}
      alt="Carro elétrico carregando no totem"
      style={{ 
        width: 150,
        height: 'auto',
        objectFit: 'contain',
        flex: 'none'
      }} 
    />
  );
}

