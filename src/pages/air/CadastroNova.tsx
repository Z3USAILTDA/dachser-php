import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

const CadastroNova = () => {
  const navigate = useNavigate();

  useEffect(() => {
    // Redirect to tracking page — the form now lives as a modal there
    navigate("/air/tracking", { replace: true });
  }, [navigate]);

  return null;
};

export default CadastroNova;
