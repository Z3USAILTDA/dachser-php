<?php
// api/router.php
// Roteador leve compatível com sintaxe de parâmetros tipo Express (:id)

class Router {
    private $routes = [];

    public function get($path, $callback) { $this->add('GET', $path, $callback); }
    public function post($path, $callback) { $this->add('POST', $path, $callback); }
    public function put($path, $callback) { $this->add('PUT', $path, $callback); }
    public function patch($path, $callback) { $this->add('PATCH', $path, $callback); }
    public function delete($path, $callback) { $this->add('DELETE', $path, $callback); }

    private function add($method, $pattern, $callback) {
        // Remove barras extras do início/fim do padrão
        $pattern = trim($pattern, '/');
        
        // Substitui placeholders do Express `:paramName` por grupos regex capturadores
        // ex: fin/users/:id/active -> fin/users/(?P<id>[^/]+)/active
        $pattern = preg_replace('/:([a-zA-Z0-9_]+)/', '(?P<$1>[^/]+)', $pattern);
        $pattern = '#^' . $pattern . '$#';
        
        $this->routes[] = [
            'method' => $method,
            'pattern' => $pattern,
            'callback' => $callback
        ];
    }

    public function dispatch($method, $route) {
        $route = trim($route, '/');
        
        foreach ($this->routes as $r) {
            if ($r['method'] === $method && preg_match($r['pattern'], $route, $matches)) {
                // Filtra apenas parâmetros nomeados da regex
                $params = [];
                foreach ($matches as $key => $val) {
                    if (is_string($key)) {
                        $params[$key] = urldecode($val);
                    }
                }
                
                try {
                    // Executa a callback passando os parâmetros
                    $r['callback']($params);
                    return;
                } catch (Exception $e) {
                    http_response_code(500);
                    echo json_encode(["success" => false, "error" => $e->getMessage()]);
                    return;
                }
            }
        }

        // Se nenhuma rota coincidiu
        http_response_code(404);
        echo json_encode(["success" => false, "error" => "Rota nao encontrada: $method $route"]);
    }
}
