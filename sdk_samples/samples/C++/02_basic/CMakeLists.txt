project(cpp_sample_02_basic)

set(CMAKE_CXX_STANDARD 17)

add_executable(${PROJECT_NAME} 02_basic.cpp)
target_link_libraries(${PROJECT_NAME} carmenVideoSDK_c)
